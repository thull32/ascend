def people_for_collision(space, p):
    q = 1.0
    n = 0
    while True:
        q *= (space - n) / space
        n += 1
        if 1 - q >= p:
            return n
