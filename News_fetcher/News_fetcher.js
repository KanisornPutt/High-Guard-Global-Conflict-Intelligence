
import https from "https";
import { SQSClient, SendMessageBatchCommand,SendMessageCommand } from "@aws-sdk/client-sqs";
 
// ─── Config ──────────────────────────────────────────────────────────────────
 
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL; // e.g. https://sqs.ap-southeast-1.amazonaws.com/123456/article-queue
const REGION = process.env.AWS_REGION || "ap-southeast-1";
 
const sqsClient = new SQSClient({ region: REGION });

export const handler = async (event) => {
	const fetchedAt = new Date().toISOString();
	const results = await Promise.allSettled(SOURCES.map(runSource));
   
	let totalArticles = 0;
	let totalErrors = 0;
   
	for (const result of results) {
	  if (result.status === "fulfilled") {
		totalArticles += result.value.count;
	  } else {
		totalErrors++;
		console.error("Source failed:", result.reason);
	  }
	}
	
	console.log(`Done. articles=${totalArticles} sourceErrors=${totalErrors}`);
	return { fetchedAt, totalArticles, totalErrors };
}

const today = new Date();
const yesterday = new Date(today - 864e5).toISOString().slice(0, 10);

const SOURCES = [
	{
		name: "NewsAPI - Top Headlines",
		country: "GLOBAL",
		fetch: () => fetchJson(`https://newsapi.org/v2/everything?q=war&from=${yesterday}&sortBy=publishedAt&apiKey=${process.env.NEWSAPI_KEY}`),
		parse: (data) =>
			(data.articles || []).map((a) => ({
				url: a.url,
				title: a.title,
				description: a.description,
				publishedAt: a.publishedAt,
				source: a.source?.name || "NewsAPI",
				country: "GLOBAL",
				lat: null,
				long: null,
			})),
	},
	{
		name: "The Guardian",
		country: "US",
		fetch: () => fetchRss("https://www.theguardian.com/us/rss"),
		parse: (items) =>
			items.map((a) => ({
				url: a.link,
				title: a.title,
				description: a.description,
				publishedAt: a.pubDate,
				source: "The Guardian",
				country: "US",
				lat: null,
				long: null,
			})),
	},
	{
		name: "New York Times",
		country: "US",
		fetch: () =>
			fetchRss(
				`https://rss.nytimes.com/services/xml/rss/nyt/World.xml`
			),
		parse: (items) =>
			items.map((a) => ({
				url: a.link,
				title: a.title,
				description: a.description,
				publishedAt: a.pubDate,
				source: "New York Times",
				country: "US",
				lat: 40.7128,
				long: -74.006,
			})),
	},
	{
		name: "Bangkok Post RSS",
		country: "TH",
		fetch: () => fetchRss("https://www.bangkokpost.com/rss/data/topstories.xml"),
		parse: (items) =>
			items.map((a) => ({
				url: a.link,
				title: a.title,
				description: a.description,
				publishedAt: a.pubDate,
				source: "Bangkok Post",
				country: "TH",
				lat: 13.7563,
				long: 100.5018,
			})),
	},
	// {
	// can't find Reuters RSS
	// 	name: "Reuters RSS",
	// 	country: "GLOBAL",
	// 	fetch: () => fetchRss("https://feeds.reuters.com/reuters/topNews"),
	// 	parse: (items) =>
	// 		items.map((a) => ({
	// 			url: a.link,
	// 			title: a.title,
	// 			description: a.description,
	// 			publishedAt: a.pubDate,
	// 			source: "Reuters",
	// 			country: "GLOBAL",
	// 			lat: null,
	// 			long: null,
	// 		})),
	// },
];


// ─── Per-source runner ────────────────────────────────────────────────────────

async function runSource(source) {
	console.log(`Fetching source: ${source.name}`);

	let raw;
	try {
		raw = await source.fetch();
	} catch (err) {
		throw new Error(`[${source.name}] fetch failed: ${err.message}`);
	}

	const articles = source.parse(raw);
	if (!articles.length) {
		console.warn(`[${source.name}] returned 0 articles`);
		return { count: 0 };
	}
	console.log(articles);

	// Normalise & deduplicate within this batch
	const unique = dedupeByUrl(articles);

	// Enrich with metadata
	const enriched = unique.map((a) => ({
		...a,
		fetchedAt: new Date().toISOString(),
		priority: derivePriority(a),
	}));

	await sendToQueue(enriched);
	console.log(`[${source.name}] sent ${enriched.length} articles to SQS`);
	return { count: enriched.length };
}

// ─── Priority heuristic ───────────────────────────────────────────────────────
// Simple keyword-based priority: HIGH / MEDIUM / LOW
// The Summary O1 Lambda will refine this using Bedrock.

const HIGH_KEYWORDS = [
	"breaking",
	"urgent",
	"alert",
	"war",
	"attack",
	"earthquake",
	"tsunami",
	"election",
	"crisis",
	"emergency",
];

function derivePriority(article) {
	const text = `${article.title} ${article.description}`.toLowerCase();
	if (HIGH_KEYWORDS.some((kw) => text.includes(kw))) return "HIGH";
	if (article.source === "Reuters" || article.source === "New York Times")
		return "MEDIUM";
	return "LOW";
}

async function sendToQueue(articles) {
	for(let i =0;i<articles.length;i++){
		const message = JSON.stringify(articles[i])
		const params = {
			QueueUrl: SQS_QUEUE_URL,
			MessageBody: message,
		};
		
		try {
		const data = await sqsClient.send(new SendMessageCommand(params));
			console.log("Success, message sent. MessageID:", data.MessageId);
		} catch (err) {
			console.error("Error sending message:", err);
		}
	}
  }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function fetchJson(url) {
	return new Promise((resolve, reject) => {
		https
			.get(url, { headers: { "User-Agent": "GlobeDashboard-Fetcher/1.0" } }, (res) => {
				let body = "";
				res.on("data", (chunk) => (body += chunk));
				res.on("end", () => {
					if (res.statusCode !== 200) {
						return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
					}
					try {
						resolve(JSON.parse(body));
					} catch (e) {
						reject(new Error(`JSON parse error (got: ${body.slice(0, 80).trim()})`));
					}
				});
			})
			.on("error", reject);
	});
}

// Minimal RSS parser — returns array of { title, link, description, pubDate }
function fetchRss(url) {
	return new Promise((resolve, reject) => {
		https
			.get(url, { headers: { "User-Agent": "GlobeDashboard-Fetcher/1.0" } }, (res) => {
				let xml = "";
				res.on("data", (chunk) => (xml += chunk));
				res.on("end", () => {
					if (res.statusCode !== 200) {
						return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
					}
					resolve(parseRssItems(xml));
				});
			})
			.on("error", reject);
	});
}

function parseRssItems(xml) {
	const items = [];
	const itemRegex = /<item>([\s\S]*?)<\/item>/g;
	let match;
	while ((match = itemRegex.exec(xml)) !== null) {
		const block = match[1];
		items.push({
			title: extractTag(block, "title"),
			link: extractTag(block, "link"),
			description: stripHtml(extractTag(block, "description")),
			pubDate: extractTag(block, "pubDate"),
		});
	}
	return items;
}

function extractTag(xml, tag) {
	const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
	return m ? (m[1] || m[2] || "").trim() : "";
}

function stripHtml(str) {
	return str.replace(/<[^>]+>/g, "").trim();
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function dedupeByUrl(articles) {
	const seen = new Set();
	return articles.filter((a) => {
		if (!a.url || seen.has(a.url)) return false;
		seen.add(a.url);
		return true;
	});
}

// Deterministic short hash for deduplication ID (URL → hex string ≤ 128 chars)
function hashUrl(url = "") {
	let h = 0;
	for (let i = 0; i < url.length; i++) {
		h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
	}
	return `url-${(h >>> 0).toString(16)}-${url.slice(-20).replace(/\W/g, "")}`.slice(0, 128);
}

