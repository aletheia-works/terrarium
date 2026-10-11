const query = new URLSearchParams(location.search);
if (
  location.pathname.replace(/\/$/, '') === '/terrarium' &&
  ['tool', 'ref', 'fixture', 'cwd', 'run', 'embed', 'origin'].some((name) =>
    query.has(name),
  )
) {
  location.replace(`/terrarium/web/${location.search}${location.hash}`);
}
