import json
import boto3
import logging
from boto3.dynamodb.conditions import Attr
from collections import defaultdict
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = "newsSummary"  # ← change if your table name differs

# ---------------------------------------------------------------------------
# Hardcoded country → (lat, lon) lookup
# Extend this dict as new countries appear in your data.
# ---------------------------------------------------------------------------
COUNTRY_COORDINATES: dict[str, tuple[float, float]] = {
    "Afghanistan": (33.9391, 67.7100),
    "Albania": (41.1533, 20.1683),
    "Algeria": (28.0339, 1.6596),
    "Angola": (-11.2027, 17.8739),
    "Argentina": (-38.4161, -63.6167),
    "Armenia": (40.0691, 45.0382),
    "Australia": (-25.2744, 133.7751),
    "Austria": (47.5162, 14.5501),
    "Azerbaijan": (40.1431, 47.5769),
    "Bahrain": (25.9304, 50.6378),
    "Bangladesh": (23.6850, 90.3563),
    "Belarus": (53.7098, 27.9534),
    "Belgium": (50.5039, 4.4699),
    "Bolivia": (-16.2902, -63.5887),
    "Bosnia and Herzegovina": (43.9159, 17.6791),
    "Brazil": (-14.2350, -51.9253),
    "Bulgaria": (42.7339, 25.4858),
    "Burkina Faso": (12.3641, -1.5275),
    "Burma": (21.9162, 95.9560),
    "Cambodia": (12.5657, 104.9910),
    "Cameroon": (7.3697, 12.3547),
    "Canada": (56.1304, -106.3468),
    "Central African Republic": (6.6111, 20.9394),
    "Chad": (15.4542, 18.7322),
    "Chile": (-35.6751, -71.5430),
    "China": (35.8617, 104.1954),
    "Colombia": (4.5709, -74.2973),
    "Congo": (-0.2280, 15.8277),
    "Croatia": (45.1000, 15.2000),
    "Cuba": (21.5218, -77.7812),
    "Czech Republic": (49.8175, 15.4730),
    "Denmark": (56.2639, 9.5018),
    "DR Congo": (-4.0383, 21.7587),
    "Ecuador": (-1.8312, -78.1834),
    "Egypt": (26.8206, 30.8025),
    "El Salvador": (13.7942, -88.8965),
    "Eritrea": (15.1794, 39.7823),
    "Ethiopia": (9.1450, 40.4897),
    "Finland": (61.9241, 25.7482),
    "France": (46.2276, 2.2137),
    "Gabon": (-0.8037, 11.6094),
    "Georgia": (42.3154, 43.3569),
    "Germany": (51.1657, 10.4515),
    "Ghana": (7.9465, -1.0232),
    "Greece": (39.0742, 21.8243),
    "Guatemala": (15.7835, -90.2308),
    "Guinea": (9.9456, -11.2420),
    "Haiti": (18.9712, -72.2852),
    "Honduras": (15.1999, -86.2419),
    "Hungary": (47.1625, 19.5033),
    "India": (20.5937, 78.9629),
    "Indonesia": (-0.7893, 113.9213),
    "Iran": (32.4279, 53.6880),
    "Iraq": (33.2232, 43.6793),
    "Ireland": (53.1424, -7.6921),
    "Israel": (31.0461, 34.8516),
    "Italy": (41.8719, 12.5674),
    "Japan": (36.2048, 138.2529),
    "Jordan": (30.5852, 36.2384),
    "Kazakhstan": (48.0196, 66.9237),
    "Kenya": (-0.0236, 37.9062),
    "Kosovo": (42.6026, 20.9030),
    "Kuwait": (29.3117, 47.4818),
    "Kyrgyzstan": (41.2044, 74.7661),
    "Laos": (19.8563, 102.4955),
    "Latvia": (56.8796, 24.6032),
    "Lebanon": (33.8547, 35.8623),
    "Libya": (26.3351, 17.2283),
    "Lithuania": (55.1694, 23.8813),
    "Macedonia": (41.6086, 21.7453),
    "Madagascar": (-18.7669, 46.8691),
    "Malawi": (-13.2543, 34.3015),
    "Malaysia": (4.2105, 101.9758),
    "Mali": (17.5707, -3.9962),
    "Mexico": (23.6345, -102.5528),
    "Moldova": (47.4116, 28.3699),
    "Morocco": (31.7917, -7.0926),
    "Mozambique": (-18.6657, 35.5296),
    "Myanmar": (21.9162, 95.9560),
    "Nepal": (28.3949, 84.1240),
    "Netherlands": (52.1326, 5.2913),
    "Nicaragua": (12.8654, -85.2072),
    "Niger": (17.6078, 8.0817),
    "Nigeria": (9.0820, 8.6753),
    "North Korea": (40.3399, 127.5101),
    "Norway": (60.4720, 8.4689),
    "Pakistan": (30.3753, 69.3451),
    "Palestine": (31.9522, 35.2332),
    "Panama": (8.5380, -80.7821),
    "Peru": (-9.1900, -75.0152),
    "Philippines": (12.8797, 121.7740),
    "Poland": (51.9194, 19.1451),
    "Portugal": (39.3999, -8.2245),
    "Qatar": (25.3548, 51.1839),
    "Romania": (45.9432, 24.9668),
    "Russia": (61.5240, 105.3188),
    "Rwanda": (-1.9403, 29.8739),
    "Saudi Arabia": (23.8859, 45.0792),
    "Senegal": (14.4974, -14.4524),
    "Serbia": (44.0165, 21.0059),
    "Sierra Leone": (8.4606, -11.7799),
    "Somalia": (5.1521, 46.1996),
    "South Africa": (-30.5595, 22.9375),
    "South Korea": (35.9078, 127.7669),
    "South Sudan": (6.8770, 31.3070),
    "Spain": (40.4637, -3.7492),
    "Sri Lanka": (7.8731, 80.7718),
    "Sudan": (12.8628, 30.2176),
    "Sweden": (60.1282, 18.6435),
    "Switzerland": (46.8182, 8.2275),
    "Syria": (34.8021, 38.9968),
    "Taiwan": (23.6978, 120.9605),
    "Tajikistan": (38.8610, 71.2761),
    "Tanzania": (-6.3690, 34.8888),
    "Thailand": (15.8700, 100.9925),
    "Tunisia": (33.8869, 9.5375),
    "Turkey": (38.9637, 35.2433),
    "Turkmenistan": (38.9697, 59.5563),
    "Uganda": (1.3733, 32.2903),
    "Ukraine": (48.3794, 31.1656),
    "United Arab Emirates": (23.4241, 53.8478),
    "United Kingdom": (55.3781, -3.4360),
    "United States": (37.0902, -95.7129),
    "Uruguay": (-32.5228, -55.7658),
    "Uzbekistan": (41.2995, 69.2401),
    "Venezuela": (6.4238, -66.5897),
    "Vietnam": (14.0583, 108.2772),
    "Yemen": (15.5527, 48.5164),
    "Zambia": (-13.1339, 27.8493),
    "Zimbabwe": (-19.0154, 29.1549),
}

# ---------------------------------------------------------------------------
# Severity aggregation strategy
#
# Each article carries a `severity` value (assumed 1-5 integer or string).
# Per country we compute: max severity seen across all recent articles.
# Alternatives are easy to swap in (average, weighted sum, etc.).
# ---------------------------------------------------------------------------

def _to_int(value) -> int | None:
    """Safely coerce Decimal / str / int → int."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def aggregate_severity(items: list[dict]) -> dict[str, int]:
    """Return {country: max_severity} from a list of DynamoDB items."""
    country_severities: dict[str, list[int]] = defaultdict(list)

    for item in items:
        country = item.get("country", "").strip()
        severity = _to_int(item.get("severity"))

        if not country or severity is None:
            continue

        country_severities[country].append(severity)

    # Strategy: MAX severity per country  ← swap to mean/sum as needed
    return {c: max(vals) for c, vals in country_severities.items()}


def lambda_handler(event, context):
    """
    GET /country-severity
    Returns a JSON array of:
      { country, lat, long, severity }
    Only countries that exist in COUNTRY_COORDINATES are included.
    Countries found in DynamoDB but missing from the map are logged.
    """
    table = dynamodb.Table(TABLE_NAME)

    # ------------------------------------------------------------------
    # Scan the full table.
    # For large tables consider adding a FilterExpression on a date GSI
    # to limit to e.g. the last 30 days.
    # ------------------------------------------------------------------
    items: list[dict] = []
    scan_kwargs: dict = {
        "ProjectionExpression": "#c, severity",
        "ExpressionAttributeNames": {"#c": "country"},  # 'country' is reserved
    }

    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    logger.info("Scanned %d items from %s", len(items), TABLE_NAME)

    aggregated = aggregate_severity(items)

    result: list[dict] = []
    unknown_countries: list[str] = []

    for country, severity in aggregated.items():
        coords = COUNTRY_COORDINATES.get(country)
        if coords is None:
            unknown_countries.append(country)
            continue
        lat, lon = coords
        result.append(
            {
                "country": country,
                "lat": lat,
                "long": lon,
                "severity": severity,
            }
        )

    if unknown_countries:
        logger.warning(
            "Countries missing from coordinate map (add them to COUNTRY_COORDINATES): %s",
            unknown_countries,
        )

    # Sort descending by severity so the client can render high-risk first
    result.sort(key=lambda x: x["severity"], reverse=True)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",   # adjust for production
        },
        "body": json.dumps(result),
    }