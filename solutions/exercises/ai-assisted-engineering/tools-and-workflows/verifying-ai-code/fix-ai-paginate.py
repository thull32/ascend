def paginate(items, page, per_page):
    total_pages = (len(items) + per_page - 1) // per_page if items else 0

    if page < 1 or page > total_pages:
        return {"items": [], "page": page, "total_pages": total_pages, "has_next": False}

    start = (page - 1) * per_page
    end = start + per_page

    return {
        "items": list(items[start:end]),
        "page": page,
        "total_pages": total_pages,
        "has_next": page < total_pages,
    }
