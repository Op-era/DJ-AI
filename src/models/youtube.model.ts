export interface YouTubeThumbnail {
    url: string;
    width: number;
    height: number;
}

export interface YouTubeThumbnails {
    default: YouTubeThumbnail;
    medium: YouTubeThumbnail;
    high: YouTubeThumbnail;
}
  
export interface YouTubeSnippet {
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    channelTitle: string;
}

export interface YouTubeContentDetails {
    duration: string; // ISO 8601 format
}

export interface YouTubeStatistics {
    viewCount: string;
    likeCount: string;
}
  
export interface YouTubeVideoId {
    kind: string;
    videoId: string;
}
  
export interface YouTubeSearchResult {
    id: YouTubeVideoId;
    snippet: YouTubeSnippet;
}

export interface YouTubeVideoDetails {
    id: string;
    snippet: YouTubeSnippet;
    contentDetails: YouTubeContentDetails;
    statistics: YouTubeStatistics;
}
