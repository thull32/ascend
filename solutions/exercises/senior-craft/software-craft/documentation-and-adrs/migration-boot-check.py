def migration_check(applied, image):
    applied_set = set(applied)
    image_set = set(image)

    unknown = sorted(applied_set - image_set)
    pending = [v for v in image if v not in applied_set]

    if not unknown and not pending:
        plan = "up_to_date"
    elif not unknown:
        plan = "apply"
    elif not pending:
        plan = "schema_ahead"
    else:
        plan = "diverged"

    return {
        "plan": plan,
        "boots": plan != "diverged",
        "unknown": unknown,
        "will_apply": pending if plan == "apply" else [],
    }
