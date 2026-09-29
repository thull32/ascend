// Serialize and Deserialize Binary Tree: level-order encoding with "#" markers
// for missing children, so shape survives even with duplicate values.
// Uses the global TreeNode class provided by the harness.
function serialize(root) {
  if (root === null) return "";
  const out = [];
  const queue = [root];
  let i = 0;
  while (i < queue.length) {
    const node = queue[i++];
    if (node === null) {
      out.push("#");
      continue;
    }
    out.push(String(node.val));
    queue.push(node.left);
    queue.push(node.right);
  }
  return out.join(",");
}

function deserialize(data) {
  if (data === "") return null;
  const tokens = data.split(",");
  const root = new TreeNode(parseInt(tokens[0], 10));
  const queue = [root];
  let qi = 0;
  let i = 1;
  while (qi < queue.length && i < tokens.length) {
    const parent = queue[qi++];
    if (tokens[i] !== "#") {
      parent.left = new TreeNode(parseInt(tokens[i], 10));
      queue.push(parent.left);
    }
    i += 1;
    if (i < tokens.length && tokens[i] !== "#") {
      parent.right = new TreeNode(parseInt(tokens[i], 10));
      queue.push(parent.right);
    }
    i += 1;
  }
  return root;
}

function roundtrip(root) {
  return deserialize(serialize(root));
}
