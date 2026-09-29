function simplify_path(path) {
  const stack = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return "/" + stack.join("/");
}
