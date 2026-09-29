def gradient_descent_step(xs, ys, w, b, lr):
    n = len(xs)
    dw_sum = 0.0
    db_sum = 0.0
    for x, y in zip(xs, ys):
        err = (w * x + b) - y
        dw_sum += err * x
        db_sum += err
    dw = 2 * dw_sum / n
    db = 2 * db_sum / n
    return [w - lr * dw, b - lr * db]
