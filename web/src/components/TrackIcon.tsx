import { Activity, Book, Box, Brain, Briefcase, Compass, Cpu, Database, GitBranch, Layers, Network, Server, Shield, Sparkles, Workflow, type LucideProps } from "lucide-react";

const icons: Record<string, React.ComponentType<LucideProps>> = { compass: Compass, layers: Layers, cpu: Cpu, "git-branch": GitBranch, network: Network, database: Database, server: Server, workflow: Workflow, brain: Brain, sparkles: Sparkles, briefcase: Briefcase, book: Book, shield: Shield, activity: Activity, box: Box };

export function TrackIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = icons[name] ?? Book;
  return <Icon {...props} />;
}
