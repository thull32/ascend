function fair_schedule(tasks, slice_us, slices) {
  const vruntime = tasks.map(() => 0);
  const order = [];
  for (let s = 0; s < slices; s++) {
    let best = 0;
    for (let i = 1; i < tasks.length; i++) {
      if (vruntime[i] < vruntime[best]) best = i;
    }
    order.push(tasks[best][0]);
    vruntime[best] += Math.floor((slice_us * 1024) / tasks[best][1]);
  }
  return order;
}
