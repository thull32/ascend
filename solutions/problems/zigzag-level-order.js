// BFS level by level; alternate appending to the end or the front of each
// level's output to zigzag direction.
function zigzag_level_order(root) {
  if (root === null) return [];
  const result = [];
  let queue = [root];
  let leftToRight = true;
  while (queue.length) {
    const level = [];
    const next = [];
    for (const node of queue) {
      if (leftToRight) level.push(node.val);
      else level.unshift(node.val);
      if (node.left !== null) next.push(node.left);
      if (node.right !== null) next.push(node.right);
    }
    result.push(level);
    queue = next;
    leftToRight = !leftToRight;
  }
  return result;
}
