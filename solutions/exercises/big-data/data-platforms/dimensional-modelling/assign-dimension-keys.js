function assign_dimension_keys(dim, facts) {
  const byCustomer = new Map();
  for (const [customerId, surrogateKey, effFrom, effTo] of dim) {
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    byCustomer.get(customerId).push([effFrom, effTo, surrogateKey]);
  }

  const result = [];
  for (const [customerId, eventDate] of facts) {
    let found = null;
    for (const [effFrom, effTo, key] of byCustomer.get(customerId) || []) {
      if (effFrom <= eventDate && (effTo === null || eventDate < effTo)) {
        found = key;
        break;
      }
    }
    result.push(found);
  }
  return result;
}
