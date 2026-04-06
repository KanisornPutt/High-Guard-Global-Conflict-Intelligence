export const MOCK_COUNTRIES = [
  { name: "Ukraine", lat: 49.0, lon: 32.0, severity: "critical", articleCount: 47, topCategory: "Armed Conflict", trend: "escalating" },
  { name: "Sudan", lat: 15.5, lon: 32.5, severity: "critical", articleCount: 31, topCategory: "Armed Conflict", trend: "escalating" },
  { name: "Gaza", lat: 31.5, lon: 34.5, severity: "critical", articleCount: 38, topCategory: "Armed Conflict", trend: "stable" },
  { name: "Yemen", lat: 15.5, lon: 48.5, severity: "high", articleCount: 19, topCategory: "Civil War", trend: "stable" },
  { name: "DRC", lat: -4.0, lon: 24.0, severity: "high", articleCount: 14, topCategory: "Armed Conflict", trend: "escalating" },
  { name: "Myanmar", lat: 16.8, lon: 96.2, severity: "high", articleCount: 11, topCategory: "Political", trend: "stable" },
  { name: "Mali", lat: 17.0, lon: -4.0, severity: "high", articleCount: 9, topCategory: "Insurgency", trend: "de-escalating" },
  { name: "Venezuela", lat: 8.0, lon: -66.0, severity: "medium", articleCount: 6, topCategory: "Civil Unrest", trend: "stable" },
  { name: "Haiti", lat: 18.9, lon: -72.3, severity: "medium", articleCount: 8, topCategory: "Civil Unrest", trend: "escalating" },
  { name: "Afghanistan", lat: 33.9, lon: 67.7, severity: "high", articleCount: 12, topCategory: "Political", trend: "stable" },
  { name: "Niger", lat: 17.6, lon: 8.1, severity: "medium", articleCount: 5, topCategory: "Political", trend: "de-escalating" },
  { name: "Ethiopia", lat: 9.1, lon: 40.5, severity: "medium", articleCount: 7, topCategory: "Armed Conflict", trend: "stable" },
];

export const MOCK_COUNTRY_SUMMARIES = {
  Ukraine: {
    country: "Ukraine",
    trend: "escalating",
    overallSituation: "Active large-scale conventional warfare continues along a 1,000km front line in eastern and southern Ukraine. Russian forces have intensified drone and missile strikes on civilian infrastructure while Ukrainian forces conduct cross-border operations into Kursk Oblast.",
    topEvents: [
      "Intensified shelling along Zaporizhzhia front",
      "Drone strike on Kharkiv energy grid",
      "Ukrainian cross-border operation in Kursk expands",
    ],
    lastUpdated: "14 min ago",
    articleCount: 47,
  },
  Sudan: {
    country: "Sudan",
    trend: "escalating",
    overallSituation: "Fighting between the Sudanese Armed Forces and Rapid Support Forces continues in Khartoum and Darfur. The humanitarian situation has reached catastrophic levels with millions displaced and aid access severely restricted.",
    topEvents: [
      "RSF advances in North Darfur capital",
      "SAF airstrikes on Omdurman residential areas",
      "UN reports mass atrocities in West Darfur",
    ],
    lastUpdated: "38 min ago",
    articleCount: 31,
  },
};

const now = Date.now();
const minsAgo = (m) => new Date(now - m * 60000).toISOString();

export const MOCK_ARTICLES = {
  Ukraine: [
    {
      articleId: "ua-001",
      articleSummary: "Russian forces launched a coordinated drone and missile barrage targeting energy infrastructure across five Ukrainian oblasts overnight, causing widespread power outages affecting millions of civilians. Ukrainian air defenses intercepted a significant portion of the projectiles, but several thermal power stations sustained damage.",
      category: "Armed Conflict",
      severity: "critical",
      priority: "high",
      timestamp: minsAgo(14),
      sourceURL: "https://reuters.com",
      sourceName: "Reuters",
    },
    {
      articleId: "ua-002",
      articleSummary: "Ukrainian ground forces consolidated positions inside Russian territory in the Kursk Oblast operation, holding approximately 1,200 square kilometers despite sustained counterattacks. Military analysts note the incursion has forced Russia to redeploy troops from other sectors of the front.",
      category: "Armed Conflict",
      severity: "critical",
      priority: "high",
      timestamp: minsAgo(52),
      sourceURL: "https://bbc.com",
      sourceName: "BBC News",
    },
    {
      articleId: "ua-003",
      articleSummary: "EU foreign ministers convened an emergency session to discuss additional financial and military aid packages for Ukraine, with several member states pledging accelerated delivery of air defense systems. Negotiations over a new €20 billion macro-financial assistance package are ongoing.",
      category: "Political",
      severity: "medium",
      priority: "medium",
      timestamp: minsAgo(130),
      sourceURL: "https://reuters.com",
      sourceName: "Reuters",
    },
    {
      articleId: "ua-004",
      articleSummary: "Heavy artillery exchanges were reported along the Zaporizhzhia front line with both sides claiming territorial gains in village-level fighting. Satellite imagery analysis confirms significant damage to defensive fortifications in a 40km stretch south of the city.",
      category: "Armed Conflict",
      severity: "high",
      priority: "high",
      timestamp: minsAgo(210),
      sourceURL: "https://bbc.com",
      sourceName: "BBC News",
    },
    {
      articleId: "ua-005",
      articleSummary: "Ukraine's parliament approved emergency legislation extending martial law and general mobilization for an additional 90 days. The vote passed with broad cross-party support amid concerns about manpower sustainability on the extended front.",
      category: "Political",
      severity: "medium",
      priority: "medium",
      timestamp: minsAgo(380),
      sourceURL: "https://reuters.com",
      sourceName: "Reuters",
    },
  ],
  Sudan: [
    {
      articleId: "sd-001",
      articleSummary: "Rapid Support Forces seized control of key neighborhoods in El Fasher, North Darfur's capital, marking a significant strategic advance following weeks of intense urban combat. Aid organizations warn of imminent humanitarian catastrophe with hospitals overwhelmed and supplies exhausted.",
      category: "Armed Conflict",
      severity: "critical",
      priority: "high",
      timestamp: minsAgo(38),
      sourceURL: "https://reuters.com",
      sourceName: "Reuters",
    },
    {
      articleId: "sd-002",
      articleSummary: "UN investigators documented evidence of mass killings and sexual violence in West Darfur towns recently captured by RSF-aligned militias. The report calls for immediate international intervention and refers evidence to the International Criminal Court.",
      category: "Armed Conflict",
      severity: "critical",
      priority: "high",
      timestamp: minsAgo(95),
      sourceURL: "https://bbc.com",
      sourceName: "BBC News",
    },
  ],
};
