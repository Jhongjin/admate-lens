async function main() {
  const res = await fetch('https://www.youtube.com/@shiseidokorea');
  const html = await res.text();
  const match = html.match(/ytInitialData\s*=\s*(\{.*?\});/);
  if (match) {
    const data = JSON.parse(match[1]);
    const banner = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.banner?.imageBannerViewModel?.image?.sources?.[0]?.url 
      || data?.header?.c4TabbedHeaderRenderer?.banner?.thumbnails?.[0]?.url;
    console.log("Banner url:", banner);
  }
}
main();
