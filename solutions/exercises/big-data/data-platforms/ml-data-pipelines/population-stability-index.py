import math


def psi(expected, actual):
    total_e = sum(expected)
    total_a = sum(actual)

    result = 0.0
    for e_count, a_count in zip(expected, actual):
        e = e_count / total_e if total_e else 0.0
        a = a_count / total_a if total_a else 0.0
        if e == 0:
            e = 0.0001
        if a == 0:
            a = 0.0001
        result += (a - e) * math.log(a / e)

    return round(result, 4)
