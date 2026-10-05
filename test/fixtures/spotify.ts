// Trimmed copies of what open.spotify.com served in October 2026.
export const embedHtml = (entity: object) =>
  `<html><head></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { state: { data: { entity } } } },
  })}</script></body></html>`;

export const getLuckyEntity = {
  type: "track",
  name: "Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]",
  id: "2Foc5Q5nqNiosCNqttzHof",
  title: "Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]",
  artists: [
    { name: "Daft Punk", uri: "spotify:artist:4tZwfgrHOc3mvqYlEYSvVi" },
    { name: "Pharrell Williams", uri: "spotify:artist:2RdwBSPQiwcmiDo9kixcl8" },
    { name: "Nile Rodgers", uri: "spotify:artist:3yDIp0kaq9EFKe07X1X2rz" },
  ],
  duration: 248413,
  visualIdentity: {
    image: [
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02", maxHeight: 300, maxWidth: 300 },
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00004851", maxHeight: 64, maxWidth: 64 },
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d0000b273", maxHeight: 640, maxWidth: 640 },
    ],
  },
};

export const trackPageHtml = `<!DOCTYPE html><html><head>
<meta property="og:site_name" content="Spotify"/>
<meta property="og:title" content="Don&#x27;t Stop Me Now - Remastered 2011"/>
<meta property="og:description" content="Queen · Jazz (2011 Remaster) · Song · 1978"/>
<meta property="og:image" content="https://i.scdn.co/image/ab67616d0000b273"/>
<meta name="music:duration" content="209"/>
<meta name="music:musician_description" content="Queen"/>
</head><body></body></html>`;
