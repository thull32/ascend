import math


def backprop_step(x, y, w1, b1, w2, b2, lr):
    z1 = w1 * x + b1
    h = 1 / (1 + math.exp(-z1))
    y_hat = w2 * h + b2

    d_yhat = y_hat - y
    d_w2 = d_yhat * h
    d_b2 = d_yhat
    d_h = d_yhat * w2
    d_z1 = d_h * h * (1 - h)
    d_w1 = d_z1 * x
    d_b1 = d_z1

    return [w1 - lr * d_w1, b1 - lr * d_b1, w2 - lr * d_w2, b2 - lr * d_b2]
