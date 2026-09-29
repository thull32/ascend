function paginate(items, page, per_page) {
  const total_pages = items.length > 0 ? Math.ceil(items.length / per_page) : 0;

  if (page < 1 || page > total_pages) {
    return { items: [], page: page, total_pages: total_pages, has_next: false };
  }

  const start = (page - 1) * per_page;
  const end = start + per_page;

  return {
    items: items.slice(start, end),
    page: page,
    total_pages: total_pages,
    has_next: page < total_pages,
  };
}
