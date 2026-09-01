-- Forward-only alignment of the deployed BSK source configuration with the
-- verified machine-readable catalog. Existing source/article rows are kept.
WITH config(name, source_type, base_url, feed_url, country, region, industry, category, reliability, language) AS (
  VALUES
    ('The Business Standard Bangladesh', 'RSS'::"SourceType", 'https://www.tbsnews.net/', 'https://www.tbsnews.net/economy/industry/rss.xml', 'Bangladesh', 'South Asia', 'Business, apparel and trade reporting', 'LOCAL_NEWS'::"SourceCategory", 'HIGH'::"SourceReliability", 'en'),
    ('Democratic Voice of Burma English', 'RSS'::"SourceType", 'https://english.dvb.no/', 'https://english.dvb.no/feed/', 'Myanmar', 'Southeast Asia', 'Independent national reporting', 'LOCAL_NEWS'::"SourceCategory", 'HIGH'::"SourceReliability", 'en'),
    ('GDACS Global Disaster Alerts RSS', 'RSS'::"SourceType", 'https://www.gdacs.org/', 'https://www.gdacs.org/xml/rss.xml', NULL, NULL, 'Global physical disruption monitoring', 'WEATHER'::"SourceCategory", 'PRIMARY'::"SourceReliability", 'en'),
    ('China Daily Business RSS', 'RSS'::"SourceType", 'https://www.chinadaily.com.cn/business', 'https://www.chinadaily.com.cn/rss/bizchina_rss.xml', 'China', 'Greater China', 'Business and manufacturing reporting', 'LOCAL_NEWS'::"SourceCategory", 'HIGH'::"SourceReliability", 'en'),
    ('NASA Breaking News RSS', 'RSS'::"SourceType", 'https://www.nasa.gov/', 'https://www.nasa.gov/rss/dyn/breaking_news.rss', NULL, NULL, 'Environmental and Earth observation', 'WEATHER'::"SourceCategory", 'PRIMARY'::"SourceReliability", 'en'),
    ('NOAA National Hurricane Center Atom', 'ATOM'::"SourceType", 'https://www.nhc.noaa.gov/', 'https://www.nhc.noaa.gov/index-at.xml', NULL, NULL, 'Cyclone and storm disruption monitoring', 'WEATHER'::"SourceCategory", 'PRIMARY'::"SourceReliability", 'en')
)
UPDATE "sources" AS source
SET "source_type" = config.source_type,
    "base_url" = config.base_url,
    "feed_url" = config.feed_url,
    "country" = config.country,
    "region" = config.region,
    "industry" = config.industry,
    "category" = config.category,
    "reliability" = config.reliability,
    "language" = config.language,
    "active" = true,
    "collection_enabled" = true,
    "collection_interval_minutes" = 5,
    "updated_at" = NOW()
FROM config
WHERE source."name" = config.name;

WITH config(id, name, source_type, base_url, feed_url, country, region, industry, category, reliability, language) AS (
  VALUES
    ('a3000000-0000-4000-8000-000000000001'::uuid, 'The Business Standard Bangladesh', 'RSS'::"SourceType", 'https://www.tbsnews.net/', 'https://www.tbsnews.net/economy/industry/rss.xml', 'Bangladesh', 'South Asia', 'Business, apparel and trade reporting', 'LOCAL_NEWS'::"SourceCategory", 'HIGH'::"SourceReliability", 'en'),
    ('a3000000-0000-4000-8000-000000000002'::uuid, 'Democratic Voice of Burma English', 'RSS'::"SourceType", 'https://english.dvb.no/', 'https://english.dvb.no/feed/', 'Myanmar', 'Southeast Asia', 'Independent national reporting', 'LOCAL_NEWS'::"SourceCategory", 'HIGH'::"SourceReliability", 'en'),
    ('a3000000-0000-4000-8000-000000000003'::uuid, 'GDACS Global Disaster Alerts RSS', 'RSS'::"SourceType", 'https://www.gdacs.org/', 'https://www.gdacs.org/xml/rss.xml', NULL, NULL, 'Global physical disruption monitoring', 'WEATHER'::"SourceCategory", 'PRIMARY'::"SourceReliability", 'en'),
    ('a3000000-0000-4000-8000-000000000004'::uuid, 'China Daily Business RSS', 'RSS'::"SourceType", 'https://www.chinadaily.com.cn/business', 'https://www.chinadaily.com.cn/rss/bizchina_rss.xml', 'China', 'Greater China', 'Business and manufacturing reporting', 'LOCAL_NEWS'::"SourceCategory", 'HIGH'::"SourceReliability", 'en'),
    ('a3000000-0000-4000-8000-000000000005'::uuid, 'NASA Breaking News RSS', 'RSS'::"SourceType", 'https://www.nasa.gov/', 'https://www.nasa.gov/rss/dyn/breaking_news.rss', NULL, NULL, 'Environmental and Earth observation', 'WEATHER'::"SourceCategory", 'PRIMARY'::"SourceReliability", 'en'),
    ('a3000000-0000-4000-8000-000000000006'::uuid, 'NOAA National Hurricane Center Atom', 'ATOM'::"SourceType", 'https://www.nhc.noaa.gov/', 'https://www.nhc.noaa.gov/index-at.xml', NULL, NULL, 'Cyclone and storm disruption monitoring', 'WEATHER'::"SourceCategory", 'PRIMARY'::"SourceReliability", 'en')
)
INSERT INTO "sources" (
  "id", "name", "source_type", "base_url", "feed_url", "country", "region",
  "industry", "category", "reliability", "language", "active",
  "collection_enabled", "collection_interval_minutes", "created_at", "updated_at"
)
SELECT config.id, config.name, config.source_type, config.base_url, config.feed_url,
       config.country, config.region, config.industry, config.category,
       config.reliability, config.language, true, true, 5, NOW(), NOW()
FROM config
WHERE NOT EXISTS (SELECT 1 FROM "sources" source WHERE source."name" = config.name);

INSERT INTO "customer_source_preferences" (
  "customer_id", "source_id", "enabled", "recommended", "reason", "created_at", "updated_at"
)
SELECT customer."id", source."id", true, true,
       CASE
         WHEN source."country" IS NOT NULL THEN 'Covers verified BSK operations in ' || source."country" || '.'
         ELSE 'Global fallback for trade, logistics, labour, material, regulatory, or physical-disruption context.'
       END,
       NOW(), NOW()
FROM "customers" customer
JOIN "sources" source ON source."name" IN (
  'The Business Standard Bangladesh',
  'Democratic Voice of Burma English',
  'GDACS Global Disaster Alerts RSS',
  'China Daily Business RSS',
  'NASA Breaking News RSS',
  'NOAA National Hurricane Center Atom'
)
WHERE customer."id" = 'b5000000-0000-4000-8000-000000000001'::uuid
ON CONFLICT ("customer_id", "source_id") DO UPDATE
SET "enabled" = true,
    "recommended" = true,
    "reason" = EXCLUDED."reason",
    "updated_at" = NOW();
