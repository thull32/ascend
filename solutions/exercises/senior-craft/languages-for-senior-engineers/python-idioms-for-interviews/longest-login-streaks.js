function longest_streaks(logins) {
  const daysByUser = new Map();
  for (const [user, day] of logins) {
    if (!daysByUser.has(user)) daysByUser.set(user, new Set());
    daysByUser.get(user).add(day);
  }

  const result = {};
  for (const [user, daysSet] of daysByUser) {
    const days = Array.from(daysSet).sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    for (let i = 0; i < days.length; i++) {
      if (i > 0 && days[i] === days[i - 1] + 1) run += 1;
      else run = 1;
      best = Math.max(best, run);
    }
    result[user] = best;
  }
  return result;
}
