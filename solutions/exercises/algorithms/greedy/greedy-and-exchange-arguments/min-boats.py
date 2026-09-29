def min_boats(people, limit):
    people = sorted(people)
    i, j = 0, len(people) - 1
    boats = 0
    while i <= j:
        boats += 1
        if i < j and people[i] + people[j] <= limit:
            i += 1
        j -= 1
    return boats
