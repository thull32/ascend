function booking(hold_s, events) {
  const seats = new Map(); // seat -> { state, owner, expires }
  const holds = new Map(); // hold_id -> [seat, ...]
  const out = [];

  for (const ev of events) {
    const kind = ev[0], t = ev[1];

    if (kind === "hold") {
      const holdId = ev[2], seatList = ev[3];
      let claimable = true;
      for (const s of seatList) {
        const st = seats.get(s);
        if (st === undefined || st.state === "AVAILABLE") continue;
        if (st.state === "HELD" && st.expires <= t) continue;
        claimable = false;
        break;
      }

      if (claimable) {
        for (const s of seatList) {
          seats.set(s, { state: "HELD", owner: holdId, expires: t + hold_s });
        }
        holds.set(holdId, seatList.slice());
        out.push("held");
      } else {
        out.push("unavailable");
      }
    } else if (kind === "checkout") {
      const holdId = ev[2];
      const seatList = holds.get(holdId) || [];
      const ok = seatList.length > 0 && seatList.every(s => {
        const st = seats.get(s);
        return st !== undefined && st.state === "HELD" && st.owner === holdId && st.expires > t;
      });
      if (ok) {
        for (const s of seatList) seats.get(s).state = "PAYMENT_PENDING";
        out.push("pending");
      } else {
        out.push("expired");
      }
    } else {
      // pay_ok / pay_fail
      const holdId = ev[2];
      const seatList = holds.get(holdId) || [];
      const ok = seatList.length > 0 && seatList.every(s => {
        const st = seats.get(s);
        return st !== undefined && st.state === "PAYMENT_PENDING" && st.owner === holdId;
      });
      if (ok) {
        const newState = kind === "pay_ok" ? "SOLD" : "AVAILABLE";
        for (const s of seatList) seats.get(s).state = newState;
        out.push(kind === "pay_ok" ? "sold" : "released");
      } else {
        out.push("invalid");
      }
    }
  }

  return out;
}
