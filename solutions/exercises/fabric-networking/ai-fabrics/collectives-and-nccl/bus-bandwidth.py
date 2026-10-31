# nccl-tests' algorithm and bus bandwidth from one measured collective.

FACTORS = {
    "allreduce": lambda n: 2 * (n - 1) / n,
    "reducescatter": lambda n: (n - 1) / n,
    "allgather": lambda n: (n - 1) / n,
    "alltoall": lambda n: (n - 1) / n,
    "broadcast": lambda n: 1,
    "reduce": lambda n: 1,
}


def bus_bandwidth(op, n, size_bytes, time_us):
    algbw = size_bytes / time_us / 1000  # bytes per microsecond / 1000 = GB/s (10^9 bytes)
    busbw = algbw * FACTORS[op](n)
    return {"algbw": round(algbw, 2), "busbw": round(busbw, 2)}
