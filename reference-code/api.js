const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { DOMParser } = require("@xmldom/xmldom");
const app = express();

// Default Tezos logo image
const DEFAULT_IMAGE = "https://purplematter.com/img/tezos.png";

// In-memory cache for feeds
let feedsCache = new Map();
let articlesCache = new Map();
let lastFetchTime = new Map();

// Default feeds
const DEFAULT_FEEDS = [
  {
    id: "1",
    title: "XTZ News",
    url: "https://xtz.news/feed/",
    defaultImage: "https://xtz.news/wp-content/uploads/2023/04/footer-logo.svg",
  },
  {
    id: "2",
    title: "Tezos Commons",
    url: "https://medium.com/feed/tezoscommons",
  },
  {
    id: "3",
    title: "Tezos Spotlight",
    url: "https://spotlight.tezos.com/feed.xml",
    defaultImage: "https://purplematter.com/img/spotlight.png",
  },
  {
    id: "4",
    title: "Tezos Agora",
    url: "https://forum.tezosagora.org/latest.rss",
    defaultImage: "https://purplematter.com/img/tezosagora.jpeg",
  },
  {
    id: "5",
    title: "#Tezos @ Medium",
    url: "https://medium.com/feed/tag/tezos",
  },
  {
    id: "6",
    title: "Madfish Solutions",
    url: "https://story.madfish.solutions/feed/",
    defaultImage: "https://purplematter.com/img/madfish.png",
  },
  {
    id: "7",
    title: "Tezos @ Youtube",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCMeXYClRGsIfqS_sqMeolqQ",
    type: "video",
    // defaultImage: "https://purplematter.com/img/tezos_yt.png",
    // defaultImage:
    //   "https://yt3.googleusercontent.com/rtfUnz5Jf4Z-6wIeKq5jiLTOWThcrX4i8BidGMwy3PDF7BCO1Gbth5MoUQNeQ7xZh96LwYNZPBM=w2560-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj",
  },
  {
    id: "8",
    title: "Nomadic Labs R&D",
    url: "https://research-development.nomadic-labs.com/feeds/all.atom.xml",
    defaultImage: "https://purplematter.com/img/nomadic.png",
  },
  {
    id: "9",
    title: "Tezos Stack Exchange",
    url: "https://tezos.stackexchange.com/feeds",
  },
  {
    id: "10",
    title: "Tezos Commons @ Youtube",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCkndRzU4YFfdfARaA_XTW9A",
    type: "video",
  },
  {
    id: "11",
    title: "Etherlink",
    url: "https://medium.com/feed/@etherlink",
  },
  {
    id: "12",
    title: "TeraBitcoins Substack",
    url: "https://terabitcoins.substack.com/feed",
  },
  {
    id: "13",
    title: "The Baking Sheet",
    url: "https://rss.beehiiv.com/feeds/hyTOUew9nJ.xml",
  },
  {
    id: "14",
    title: "Tez Capital",
    url: "https://medium.com/feed/@tezcapital",
  },
  {
    id: "15",
    title: "Tezos Domains Governance",
    url: "https://talk.tezos.domains/latest.rss",
    defaultImage: "https://purplematter.com/img/tezosdomains.png",
  },
];

// Initialize cache with default feeds
DEFAULT_FEEDS.forEach((feed) => {
  feedsCache.set(feed.id, feed);
});

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Add logging middleware
app.use(morgan("combined"));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Parse XML feed content
function parseFeedContent(xml, feed) {
  try {
    // Remove any DOCTYPE declarations or processing instructions
    xml = xml.replace(/<\?[^>]*\?>/g, "").replace(/<!DOCTYPE[^>]*>/g, "");

    const parser = new DOMParser({
      locator: {},
      onError: () => {}, // Handle parsing errors silently
    });

    const doc = parser.parseFromString(xml, "text/xml");
    const items = [];

    // Helper function to safely get text content
    const getTextContent = (element) => {
      try {
        return element ? element.textContent.trim() : "";
      } catch (e) {
        return "";
      }
    };

    // Helper function to get elements
    const getElements = (doc, tags) => {
      if (typeof tags === "string") tags = [tags];
      for (const tag of tags) {
        try {
          const elements = doc.getElementsByTagName(tag);
          if (elements && elements.length > 0) return Array.from(elements);
        } catch (e) {
          console.warn(`Failed to get elements for tag ${tag}`);
        }
      }
      return [];
    };

    // Try different feed formats (RSS 2.0, RSS 1.0, Atom)
    const entries = getElements(doc, ["item", "entry"]);

    if (!entries || entries.length === 0) {
      console.warn("No entries found in feed");
      return [];
    }

    entries.forEach((item) => {
      try {
        // Get title
        const title = getTextContent(item.getElementsByTagName("title")[0]);

        // Get link
        let link = "";
        const linkElements = getElements(item, ["link", "guid"]);
        for (const linkElement of linkElements) {
          const href = linkElement.getAttribute("href");
          const textContent = getTextContent(linkElement);
          if (href && href.startsWith("http")) {
            link = href;
            break;
          } else if (textContent && textContent.startsWith("http")) {
            link = textContent;
            break;
          }
        }

        // Get content
        let content = "";
        const contentElements = getElements(item, [
          "content:encoded",
          "content",
          "description",
          "summary",
        ]);
        for (const element of contentElements) {
          const text = getTextContent(element);
          if (text) {
            content = text;
            break;
          }
        }

        // Get publication date
        let pubDate = "";
        const dateElements = getElements(item, [
          "pubDate",
          "published",
          "updated",
          "dc:date",
          "date",
        ]);
        for (const element of dateElements) {
          const date = getTextContent(element);
          if (date) {
            pubDate = date;
            break;
          }
        }

        // Only add items that have at least a title and some content
        if (title && (link || content)) {
          // Clean up content if needed
          content = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

          // Try to extract the first image from content if available
          let image = "";
          // First try to get image from media:content or enclosure tags
          const mediaContent = item.getElementsByTagName("media:content")[0];
          const enclosure = item.getElementsByTagName("enclosure")[0];
          const imageTag = item.getElementsByTagName("image")[0];

          if (mediaContent && mediaContent.getAttribute("url")) {
            image = mediaContent.getAttribute("url");
          } else if (
            enclosure &&
            enclosure.getAttribute("url") &&
            enclosure.getAttribute("type")?.startsWith("image/")
          ) {
            image = enclosure.getAttribute("url");
          } else if (
            imageTag &&
            getTextContent(imageTag.getElementsByTagName("url")[0])
          ) {
            image = getTextContent(imageTag.getElementsByTagName("url")[0]);
          } else {
            // Try multiple approaches to find images in content
            const imgPatterns = [
              /<img[^>]+src=["']([^"']+)["']/i, // Standard img tag
              /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, // OpenGraph image
              /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i, // Twitter image
              /<figure[^>]*>.*?<img[^>]+src=["']([^"']+)["']/i, // Figure with img
              /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i, // CSS background-image
              /<div[^>]+style=["'][^"']*background-image:\s*url\(['"]([^'"]+)['"]\)["']/i, // Div with background image
              /<a[^>]+href=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))["']/i, // Links to image files
              /data-image-src=["']([^"']+)["']/i, // Custom data attributes
              /data-src=["']([^"']+)["']/i, // Lazy loading images
              /content=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))["']/i, // Meta tags with image URLs
            ];

            // Try each pattern until we find a valid image
            for (const pattern of imgPatterns) {
              const match = content.match(pattern);
              if (match && match[1] && match[1].startsWith("http")) {
                image = match[1];
                break;
              }
            }

            // If still no image, try to find any URL that ends with an image extension
            if (!image) {
              const imageExtPattern =
                /https?:\/\/[^"'\s)]+\.(?:jpg|jpeg|png|gif|webp)(?:[?#][^"'\s)]*)?/i;
              const match = content.match(imageExtPattern);
              if (match && match[0]) {
                image = match[0];
              }
            }

            // If still no image, try to find any URL that contains common image path patterns
            if (!image) {
              const imagePathPattern =
                /https?:\/\/[^"'\s)]+(?:\/images?\/|\/media\/|\/uploads?\/|\/photos?\/)[^"'\s)]+/i;
              const match = content.match(imagePathPattern);
              if (match && match[0]) {
                image = match[0];
              }
            }
          }

          // Use feed's default image if no image found or if the URL is invalid
          // always default for Tezos Agora
          if (
            feed.title === "Tezos Agora" ||
            feed.title === "Tezos Domains Governance" ||
            !image ||
            !image.match(/^https?:\/\/.+/)
          ) {
            image = feed.defaultImage || DEFAULT_IMAGE;
          }

          items.push({
            title,
            link,
            content,
            image,
            pubDate: pubDate || new Date().toISOString(),
            feedId: feed.id,
            feedTitle: feed.title,
          });
        }
      } catch (error) {
        console.warn("Error parsing feed item:", error.message);
      }
    });

    return items;
  } catch (error) {
    console.error("Error parsing XML:", error.message);
    return [];
  }
}

// Fetch and cache feed content
async function fetchAndCacheFeed(feed) {
  try {
    // console.log(`Fetching ${feed.title} from ${feed.url}`);
    const response = await axios.get(feed.url, {
      timeout: 10000,
      headers: {
        "User-Agent": "TezosFeedReader/1.0",
        Accept:
          "application/rss+xml, application/xml, application/atom+xml, text/xml, */*",
      },
      responseType: "text",
      transformResponse: [(data) => data], // Prevent axios from parsing XML
    });

    if (!response.data) {
      throw new Error("Empty response from feed");
    }

    const articles = parseFeedContent(response.data, feed);
    console.log(`Found ${articles.length} articles in ${feed.title}`);

    // if (feed.title === "Madfish Solutions") {
    //   console.log("Madfish Solutions articles:");
    //   articles.forEach((article, index) => {
    //     console.log(`${index + 1}. ${article.title}`);
    //   });
    // }

    if (articles.length === 0) {
      throw new Error("No articles found in feed");
    }

    articlesCache.set(feed.id, articles);
    lastFetchTime.set(feed.id, Date.now());

    return articles;
  } catch (error) {
    console.error(`Error fetching feed ${feed.title}:`, error.message);
    throw error;
  }
}

// Initialize feeds on server start
async function initializeFeeds() {
  console.log("Initializing feeds...");
  const feeds = Array.from(feedsCache.values());
  for (const feed of feeds) {
    try {
      console.log(`Fetching feed: ${feed.title}`);
      await fetchAndCacheFeed(feed);
      // console.log(`Successfully fetched ${feed.title}`);
    } catch (error) {
      console.error(`Failed to initialize feed ${feed.title}:`, error);
    }
  }
  console.log("Feeds initialization completed");
}

// Start initializing feeds immediately
initializeFeeds();

// Get all feeds
app.get("/api/feeds", (req, res) => {
  const feeds = Array.from(feedsCache.values());
  res.json(feeds);
});

// Get all articles
app.get("/api/articles", async (req, res) => {
  try {
    const currentTime = Date.now();
    const feeds = Array.from(feedsCache.values());

    // Refresh feeds that haven't been updated in the last hour
    const refreshPromises = feeds.map(async (feed) => {
      const lastFetch = lastFetchTime.get(feed.id) || 0;
      if (currentTime - lastFetch > 60 * 60 * 1000) {
        // 1 hour
        try {
          await fetchAndCacheFeed(feed);
        } catch (error) {
          console.error(`Failed to refresh feed ${feed.title}:`, error);
        }
      }
    });

    await Promise.all(refreshPromises);

    // Combine all articles
    const allArticles = [];
    feeds.forEach((feed) => {
      const feedArticles = articlesCache.get(feed.id) || [];
      allArticles.push(
        ...feedArticles.map((article) => ({
          ...article,
          feedTitle: feed.title,
          feedId: feed.id,
        }))
      );
    });

    // Sort by date only, no limit
    const sortedArticles = allArticles.sort(
      (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
    );

    res.json(sortedArticles);
  } catch (error) {
    console.error("Error fetching articles:", error);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

// Add new feed
app.post("/api/feeds", async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: "Title and URL are required" });
    }

    const id = Date.now().toString();
    const newFeed = { id, title, url };

    // Test the feed before adding
    await fetchAndCacheFeed(newFeed);

    feedsCache.set(id, newFeed);
    res.status(201).json(newFeed);
  } catch (error) {
    console.error("Error adding feed:", error);
    res.status(500).json({ error: "Failed to add feed" });
  }
});

// Update feed
app.put("/api/feeds/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, url } = req.body;

    if (!feedsCache.has(id)) {
      return res.status(404).json({ error: "Feed not found" });
    }

    const updatedFeed = { id, title, url };

    // Test the feed before updating
    await fetchAndCacheFeed(updatedFeed);

    feedsCache.set(id, updatedFeed);
    res.json(updatedFeed);
  } catch (error) {
    console.error("Error updating feed:", error);
    res.status(500).json({ error: "Failed to update feed" });
  }
});

// Delete feed
app.delete("/api/feeds/:id", (req, res) => {
  const { id } = req.params;

  if (!feedsCache.has(id)) {
    return res.status(404).json({ error: "Feed not found" });
  }

  feedsCache.delete(id);
  articlesCache.delete(id);
  lastFetchTime.delete(id);
  res.status(204).send();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3660;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
