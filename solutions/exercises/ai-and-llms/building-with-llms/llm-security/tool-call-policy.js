function review_calls(policy, calls) {
  const tools = policy.tools || {};
  let tainted = false;
  const decisions = [];

  for (const call of calls) {
    const name = call.name;
    const args = call.args || {};
    const rule = tools[name];
    if (rule === undefined) {
      decisions.push("deny");
      continue;
    }

    let denied = false;
    if ("paths" in rule) {
      const path = args.path;
      if (typeof path !== "string") {
        denied = true;
      } else {
        const prefixes = rule.paths;
        if (!prefixes.some((pfx) => path.startsWith(pfx))) {
          denied = true;
        } else if (path.split("/").includes("..")) {
          denied = true;
        }
      }
    }

    if (!denied && "domains" in rule) {
      const to = args.to;
      if (typeof to !== "string" || !to.includes("@")) {
        denied = true;
      } else {
        const domain = to.slice(to.lastIndexOf("@") + 1).toLowerCase();
        const domains = rule.domains.map((d) => d.toLowerCase());
        if (!domains.includes(domain)) {
          denied = true;
        }
      }
    }

    if (denied) {
      decisions.push("deny");
      continue;
    }

    let decision = "allow";
    if (rule.confirm === true) {
      decision = "confirm";
    } else if (rule.egress === true && tainted) {
      decision = "confirm";
    }
    decisions.push(decision);

    if (rule.untrusted === true) {
      tainted = true;
    }
  }

  return decisions;
}
