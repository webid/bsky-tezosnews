import React, { useState, useEffect } from "react";
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  createTheme,
  ThemeProvider,
  styled,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  RssFeed as RssFeedIcon,
} from "@mui/icons-material";
import { Feed, Article } from "./types";

// Create custom theme
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#E97B34", // Orange color from the image
    },
    background: {
      default: "#1A1A1A",
      paper: "#2A2A2A",
    },
    error: {
      main: "#FF4B4B", // Red color for errors
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: "#1E1E1E",
          borderRadius: 16,
          border: "1px solid #333",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          borderRadius: 24,
        },
      },
    },
  },
});

// Styled components with proper types
const AddFeedButton = styled(Button)(() => ({
  borderRadius: 24,
  padding: "8px 24px",
  backgroundColor: "#E97B34",
  "&:hover": {
    backgroundColor: "#D16A23",
  },
}));

const ErrorText = styled(Typography)(() => ({
  color: "#FF4B4B",
  marginTop: 8,
}));

function App() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [expandedFeed, setExpandedFeed] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [feedErrors] = useState<Record<string, string>>({});
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [newFeed, setNewFeed] = useState<Partial<Feed>>({
    title: "",
    url: "",
  });
  const [visibleArticlesCount, setVisibleArticlesCount] = useState<number>(50);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [openFilterDialog, setOpenFilterDialog] = useState(false);

  useEffect(() => {
    if (feeds.length > 0) {
      const stored = localStorage.getItem("selectedFeedIds");
      if (stored) {
        setSelectedFeedIds(JSON.parse(stored));
      } else {
        setSelectedFeedIds(feeds.map((f) => f.id));
      }
    }
  }, [feeds]);

  // Fetch feeds and articles
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch feeds
        const feedsResponse = await fetch(
          "https://tezlens.purplematter.com/api/feeds"
        );
        const feedsData = await feedsResponse.json();
        setFeeds(feedsData);

        // Fetch articles
        const articlesResponse = await fetch(
          "https://tezlens.purplematter.com/api/articles"
        );
        const articlesData = await articlesResponse.json();
        console.log("Total articles fetched:", articlesData.length);
        console.log(
          "Articles by feed:",
          articlesData.reduce(
            (acc: Record<string, number>, article: Article) => {
              acc[article.feedTitle] = (acc[article.feedTitle] || 0) + 1;
              return acc;
            },
            {}
          )
        );
        setArticles(articlesData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
    // Refresh articles every 5 minutes
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          "https://tezlens.purplematter.com/api/articles"
        );
        const data = await response.json();
        setArticles(data);
      } catch (error) {
        console.error("Error refreshing articles:", error);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (isLoadingMore || isAdminView) return;

      const { scrollTop, clientHeight, scrollHeight } =
        document.documentElement;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setIsLoadingMore(true);
        setVisibleArticlesCount((prev) => prev + 50);
        setIsLoadingMore(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoadingMore, isAdminView]);

  const handleAddFeed = async () => {
    if (newFeed.title && newFeed.url) {
      try {
        const response = await fetch(
          "https://tezlens.purplematter.com/api/feeds",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(newFeed),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to add feed");
        }

        const addedFeed = await response.json();
        setFeeds([...feeds, addedFeed]);
        setNewFeed({ title: "", url: "" });
        setOpenAddDialog(false);

        // Refresh articles to include the new feed
        const articlesResponse = await fetch(
          "https://tezlens.purplematter.com/api/articles"
        );
        const articlesData = await articlesResponse.json();
        setArticles(articlesData);
      } catch (error) {
        console.error("Error adding feed:", error);
      }
    }
  };

  const handleEditFeed = async () => {
    if (editingFeed) {
      try {
        const response = await fetch(
          `https://tezlens.purplematter.com/api/feeds/${editingFeed.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(editingFeed),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update feed");
        }

        const updatedFeed = await response.json();
        setFeeds(
          feeds.map((feed) => (feed.id === updatedFeed.id ? updatedFeed : feed))
        );
        setOpenEditDialog(false);
        setEditingFeed(null);

        // Refresh articles to reflect the changes
        const articlesResponse = await fetch(
          "https://tezlens.purplematter.com/api/articles"
        );
        const articlesData = await articlesResponse.json();
        setArticles(articlesData);
      } catch (error) {
        console.error("Error updating feed:", error);
      }
    }
  };

  const handleDeleteFeed = async (id: string) => {
    try {
      const response = await fetch(
        `https://tezlens.purplematter.com/api/feeds/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete feed");
      }

      setFeeds(feeds.filter((feed) => feed.id !== id));

      // Refresh articles to reflect the deletion
      const articlesResponse = await fetch(
        "https://tezlens.purplematter.com/api/articles"
      );
      const articlesData = await articlesResponse.json();
      setArticles(articlesData);
    } catch (error) {
      console.error("Error deleting feed:", error);
    }
  };

  const getAllArticlesSorted = (): Article[] => {
    // Helper function to normalize URLs
    const normalizeUrl = (url: string): string => {
      try {
        const parsed = new URL(url);
        return (
          parsed.origin.toLowerCase() +
          parsed.pathname.toLowerCase().replace(/\/$/, "")
        );
      } catch {
        return url.toLowerCase().replace(/\/$/, "");
      }
    };

    // Sort articles by date first
    const sortedArticles = [...articles].sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );

    const filteredArticles = sortedArticles.filter((article) =>
      selectedFeedIds.includes(article.feedId)
    );
    // For public view: deduplicate and limit to visibleArticlesCount
    if (!isAdminView) {
      const seenLinks = new Set<string>();
      const deduplicatedArticles = filteredArticles.filter((article) => {
        const isVideoFeed =
          feeds.find((f) => f.id === article.feedId)?.type === "video";
        if (isVideoFeed) return true;
        const normalizedLink = normalizeUrl(article.link);
        if (!seenLinks.has(normalizedLink)) {
          seenLinks.add(normalizedLink);
          return true;
        }
        return false;
      });

      return deduplicatedArticles.slice(0, visibleArticlesCount);
    }

    return sortedArticles;
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh", py: 4 }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 4,
            }}
          >
            <Button
              variant="outlined"
              sx={{ borderColor: "#E97B34", color: "#E97B34" }}
              onClick={() => setOpenFilterDialog(true)}
            >
              Filter Feeds
            </Button>
            <Box
              sx={{
                display: "flex",
                visibility: "hidden",
                alignItems: "center",
                gap: 2,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={isAdminView}
                    onChange={(e) => setIsAdminView(e.target.checked)}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": {
                        color: "#E97B34",
                      },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                        {
                          backgroundColor: "#E97B34",
                        },
                    }}
                  />
                }
                label={
                  <Typography sx={{ color: "#FFF" }}>Admin View</Typography>
                }
              />
              {isAdminView && (
                <AddFeedButton
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setOpenAddDialog(true)}
                >
                  Add Feed
                </AddFeedButton>
              )}
            </Box>
          </Box>

          {isAdminView ? (
            <>
              <Box sx={{ display: "grid", gap: 2 }}>
                {feeds.map((feed) => (
                  <Card key={feed.id}>
                    <CardHeader
                      avatar={<RssFeedIcon sx={{ color: "#666" }} />}
                      title={
                        <Typography variant="h6" sx={{ color: "#FFF" }}>
                          {feed.title}
                        </Typography>
                      }
                      action={
                        <Box>
                          <IconButton
                            onClick={() => {
                              setEditingFeed(feed);
                              setOpenEditDialog(true);
                            }}
                          >
                            <EditIcon sx={{ color: "#666" }} />
                          </IconButton>
                          <IconButton onClick={() => handleDeleteFeed(feed.id)}>
                            <DeleteIcon sx={{ color: "#666" }} />
                          </IconButton>
                          <IconButton
                            onClick={() =>
                              setExpandedFeed(
                                expandedFeed === feed.id ? null : feed.id
                              )
                            }
                          >
                            {expandedFeed === feed.id ? (
                              <ExpandLessIcon sx={{ color: "#666" }} />
                            ) : (
                              <ExpandMoreIcon sx={{ color: "#666" }} />
                            )}
                          </IconButton>
                        </Box>
                      }
                    />
                    {feedErrors[feed.id] && (
                      <ErrorText variant="body2" sx={{ px: 2, pb: 2 }}>
                        Error: {feedErrors[feed.id]}
                      </ErrorText>
                    )}
                    {expandedFeed === feed.id &&
                      (() => {
                        // Helper function to normalize URLs
                        const normalizeUrl = (url: string): string => {
                          try {
                            const parsed = new URL(url);
                            return (
                              parsed.origin.toLowerCase() +
                              parsed.pathname.toLowerCase().replace(/\/$/, "")
                            );
                          } catch {
                            return url.toLowerCase().replace(/\/$/, "");
                          }
                        };

                        // Filter articles for this specific feed
                        const feedArticles = articles
                          .filter((article) => article.feedId === feed.id)
                          .sort(
                            (a, b) =>
                              new Date(b.pubDate).getTime() -
                              new Date(a.pubDate).getTime()
                          );

                        // For video feeds, show all articles without deduplication
                        if (feed.type === "video") {
                          return (
                            <Box sx={{ p: 2, borderTop: "1px solid #333" }}>
                              {feedArticles
                                .slice(0, 5)
                                .map((article, index) => (
                                  <Box
                                    key={index}
                                    sx={{
                                      mb: 3,
                                      p: 2,
                                      backgroundColor: "#2A2A2A",
                                      borderRadius: 1,
                                      "&:last-child": { mb: 0 },
                                      "&:hover": {
                                        backgroundColor: "#333333",
                                      },
                                    }}
                                  >
                                    <Typography variant="h6" sx={{ mb: 1 }}>
                                      <a
                                        href={article.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          color: "#E97B34",
                                          textDecoration: "none",
                                        }}
                                        onMouseOver={(e) => {
                                          e.currentTarget.style.textDecoration =
                                            "underline";
                                        }}
                                        onMouseOut={(e) => {
                                          e.currentTarget.style.textDecoration =
                                            "none";
                                        }}
                                      >
                                        {article.title}
                                      </a>
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{ color: "#666" }}
                                    >
                                      {new Date(
                                        article.pubDate
                                      ).toLocaleDateString()}
                                    </Typography>
                                  </Box>
                                ))}
                            </Box>
                          );
                        }

                        // For other feeds, keep the existing deduplication logic
                        const seenLinks = new Set<string>();
                        const uniqueArticles = feedArticles.filter(
                          (article) => {
                            const normalizedLink = normalizeUrl(article.link);
                            if (!seenLinks.has(normalizedLink)) {
                              seenLinks.add(normalizedLink);
                              return true;
                            }
                            return false;
                          }
                        );

                        return (
                          <Box sx={{ p: 2, borderTop: "1px solid #333" }}>
                            {uniqueArticles
                              .slice(0, 5)
                              .map((article, index) => (
                                <Box
                                  key={index}
                                  sx={{
                                    mb: 3,
                                    p: 2,
                                    backgroundColor: "#2A2A2A",
                                    borderRadius: 1,
                                    "&:last-child": { mb: 0 },
                                    "&:hover": {
                                      backgroundColor: "#333333",
                                    },
                                  }}
                                >
                                  <Typography variant="h6" sx={{ mb: 1 }}>
                                    <a
                                      href={article.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: "#E97B34",
                                        textDecoration: "none",
                                      }}
                                      onMouseOver={(e) => {
                                        e.currentTarget.style.textDecoration =
                                          "underline";
                                      }}
                                      onMouseOut={(e) => {
                                        e.currentTarget.style.textDecoration =
                                          "none";
                                      }}
                                    >
                                      {article.title}
                                    </a>
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ color: "#666" }}
                                  >
                                    {new Date(
                                      article.pubDate
                                    ).toLocaleDateString()}
                                  </Typography>
                                </Box>
                              ))}
                          </Box>
                        );
                      })()}
                  </Card>
                ))}
              </Box>
            </>
          ) : (
            // Public view with latest articles in a responsive grid

            <Box
              sx={{
                display: "grid",
                gap: 3,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
              }}
            >
              {getAllArticlesSorted().map((article, index) => (
                <Card
                  key={index}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#2A2A2A",
                    "&:hover": {
                      backgroundColor: "#333333",
                      "& .article-image": {
                        transform: "scale(1.05)",
                      },
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      paddingTop: "56.25%", // 16:9 aspect ratio
                      width: "100%",
                      overflow: "hidden",
                      backgroundColor: "#1E1E1E",
                    }}
                  >
                    {(() => {
                      const isVideoFeed =
                        feeds.find((f) => f.id === article.feedId)?.type ===
                        "video";
                      const isYouTubeShorts = article.link.includes("/shorts/");

                      // Helper function to extract video ID from YouTube shorts URL
                      const getYouTubeShortsId = (
                        url: string
                      ): string | null => {
                        const match = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
                        return match ? match[1] : null;
                      };

                      if (isVideoFeed && isYouTubeShorts) {
                        // For YouTube shorts, show thumbnail instead of embedding
                        const videoId = getYouTubeShortsId(article.link);
                        const thumbnailUrl = videoId
                          ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                          : article.image;

                        return (
                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                            }}
                          >
                            <Box
                              component="img"
                              className="article-image"
                              src={thumbnailUrl}
                              alt={article.title}
                              sx={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                backgroundColor: "#1E1E1E",
                                transition: "transform 0.3s ease-in-out",
                                padding: 0,
                              }}
                            />
                          </a>
                        );
                      } else if (isVideoFeed) {
                        // For regular videos, embed them
                        return (
                          <Box
                            component="iframe"
                            src={article.link.replace("watch?v=", "embed/")}
                            sx={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              border: "none",
                            }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        );
                      } else {
                        // For non-video feeds, show regular image
                        return (
                          <Box
                            component="img"
                            className="article-image"
                            src={article.image}
                            alt={article.title}
                            sx={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              backgroundColor: "#1E1E1E",
                              transition: "transform 0.3s ease-in-out",
                              padding: 0,
                            }}
                          />
                        );
                      }
                    })()}
                  </Box>
                  <CardContent
                    sx={{
                      flexGrow: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      p: 2,
                    }}
                  >
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{
                          color: "#FFFFFF",
                          fontWeight: 600,
                          fontSize: "1.1rem",
                          lineHeight: 1.3,
                          mb: 1,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          "&:hover": {
                            color: "#E97B34",
                          },
                        }}
                      >
                        {article.title}
                      </Typography>
                    </a>

                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mt: "auto",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#999",
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        {article.feedTitle} |{" "}
                        {new Date(article.pubDate).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
              {isLoadingMore && (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography sx={{ color: "#FFF" }}>
                    Loading more articles...
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          <Dialog
            open={openFilterDialog}
            onClose={() => setOpenFilterDialog(false)}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "#1E1E1E",
                  borderRadius: 2,
                },
              },
            }}
          >
            <DialogTitle sx={{ color: "#FFF" }}>
              Select Feed Sources
            </DialogTitle>
            <DialogContent>
              <Button
                size="small"
                variant="outlined"
                sx={{ color: "#E97B34", borderColor: "#E97B34" }}
                onClick={() => {
                  const allIds = feeds.map((f) => f.id);
                  setSelectedFeedIds(allIds);
                  localStorage.setItem(
                    "selectedFeedIds",
                    JSON.stringify(allIds)
                  );
                }}
              >
                Select All
              </Button>
              <Button
                size="small"
                variant="outlined"
                sx={{ color: "#E97B34", borderColor: "#E97B34", marginLeft: 1 }}
                onClick={() => {
                  setSelectedFeedIds([]);
                  localStorage.setItem("selectedFeedIds", JSON.stringify([]));
                }}
              >
                Deselect All
              </Button>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  pt: 1,
                }}
              >
                {feeds.map((feed) => (
                  <FormControlLabel
                    key={feed.id}
                    control={
                      <Switch
                        size="small"
                        checked={selectedFeedIds.includes(feed.id)}
                        onChange={(e) => {
                          let updated: string[];
                          if (e.target.checked) {
                            updated = [...selectedFeedIds, feed.id];
                          } else {
                            updated = selectedFeedIds.filter(
                              (id) => id !== feed.id
                            );
                          }
                          setSelectedFeedIds(updated);
                          localStorage.setItem(
                            "selectedFeedIds",
                            JSON.stringify(updated)
                          );
                        }}
                        sx={{
                          "& .MuiSwitch-switchBase.Mui-checked": {
                            color: "#E97B34",
                          },
                          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                            {
                              backgroundColor: "#E97B34",
                            },
                        }}
                      />
                    }
                    label={
                      <Typography sx={{ color: "#FFF" }}>
                        {feed.title}
                      </Typography>
                    }
                    sx={{
                      m: 0, // remove margin
                      pl: 1, // slight left padding for alignment
                      py: 0.25, // less vertical padding
                    }}
                  />
                ))}
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
              <Button
                onClick={() => setOpenFilterDialog(false)}
                variant="contained"
                sx={{
                  bgcolor: "#E97B34",
                  color: "#FFF",
                  "&:hover": {
                    bgcolor: "#D16A23",
                  },
                }}
              >
                Close
              </Button>
            </DialogActions>
          </Dialog>

          {/* Add Feed Dialog */}
          <Dialog
            open={openAddDialog}
            onClose={() => setOpenAddDialog(false)}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "#1E1E1E",
                  borderRadius: 2,
                },
              },
            }}
          >
            <DialogTitle sx={{ color: "#FFF" }}>Add New Feed</DialogTitle>
            <DialogContent>
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}
              >
                <TextField
                  label="Feed Title"
                  value={newFeed.title}
                  onChange={(e) =>
                    setNewFeed({ ...newFeed, title: e.target.value })
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": {
                        borderColor: "#333",
                      },
                      "&:hover fieldset": {
                        borderColor: "#666",
                      },
                    },
                  }}
                />
                <TextField
                  label="Feed URL"
                  value={newFeed.url}
                  onChange={(e) =>
                    setNewFeed({ ...newFeed, url: e.target.value })
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": {
                        borderColor: "#333",
                      },
                      "&:hover fieldset": {
                        borderColor: "#666",
                      },
                    },
                  }}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
              <Button
                onClick={() => setOpenAddDialog(false)}
                sx={{ color: "#666" }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddFeed}
                variant="contained"
                sx={{
                  bgcolor: "#E97B34",
                  "&:hover": {
                    bgcolor: "#D16A23",
                  },
                }}
              >
                Add Feed
              </Button>
            </DialogActions>
          </Dialog>

          {/* Edit Feed Dialog */}
          <Dialog
            open={openEditDialog}
            onClose={() => setOpenEditDialog(false)}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "#1E1E1E",
                  borderRadius: 2,
                },
              },
            }}
          >
            <DialogTitle sx={{ color: "#FFF" }}>Edit Feed</DialogTitle>
            <DialogContent>
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}
              >
                <TextField
                  label="Feed Title"
                  value={editingFeed?.title || ""}
                  onChange={(e) =>
                    editingFeed &&
                    setEditingFeed({ ...editingFeed, title: e.target.value })
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": {
                        borderColor: "#333",
                      },
                      "&:hover fieldset": {
                        borderColor: "#666",
                      },
                    },
                  }}
                />
                <TextField
                  label="Feed URL"
                  value={editingFeed?.url || ""}
                  onChange={(e) =>
                    editingFeed &&
                    setEditingFeed({ ...editingFeed, url: e.target.value })
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": {
                        borderColor: "#333",
                      },
                      "&:hover fieldset": {
                        borderColor: "#666",
                      },
                    },
                  }}
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
              <Button
                onClick={() => setOpenEditDialog(false)}
                sx={{ color: "#666" }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditFeed}
                variant="contained"
                sx={{
                  bgcolor: "#E97B34",
                  "&:hover": {
                    bgcolor: "#D16A23",
                  },
                }}
              >
                Save Changes
              </Button>
            </DialogActions>
          </Dialog>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
