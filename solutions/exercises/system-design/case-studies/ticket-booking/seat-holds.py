def booking(hold_s, events):
    seats = {}  # seat -> {"state", "owner", "expires"}
    holds = {}  # hold_id -> [seat, ...]
    out = []

    for ev in events:
        kind, t = ev[0], ev[1]

        if kind == "hold":
            hold_id, seat_list = ev[2], ev[3]
            claimable = True
            for s in seat_list:
                st = seats.get(s)
                if st is None or st["state"] == "AVAILABLE":
                    continue
                if st["state"] == "HELD" and st["expires"] <= t:
                    continue
                claimable = False
                break

            if claimable:
                for s in seat_list:
                    seats[s] = {"state": "HELD", "owner": hold_id, "expires": t + hold_s}
                holds[hold_id] = list(seat_list)
                out.append("held")
            else:
                out.append("unavailable")

        elif kind == "checkout":
            hold_id = ev[2]
            seat_list = holds.get(hold_id, [])
            ok = len(seat_list) > 0 and all(
                seats.get(s, {}).get("state") == "HELD"
                and seats[s]["owner"] == hold_id
                and seats[s]["expires"] > t
                for s in seat_list
            )
            if ok:
                for s in seat_list:
                    seats[s]["state"] = "PAYMENT_PENDING"
                out.append("pending")
            else:
                out.append("expired")

        else:  # pay_ok / pay_fail
            hold_id = ev[2]
            seat_list = holds.get(hold_id, [])
            ok = len(seat_list) > 0 and all(
                seats.get(s, {}).get("state") == "PAYMENT_PENDING"
                and seats[s]["owner"] == hold_id
                for s in seat_list
            )
            if ok:
                new_state = "SOLD" if kind == "pay_ok" else "AVAILABLE"
                for s in seat_list:
                    seats[s]["state"] = new_state
                out.append("sold" if kind == "pay_ok" else "released")
            else:
                out.append("invalid")

    return out
