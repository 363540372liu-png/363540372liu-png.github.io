export const discoveries = [
  {
    id: "ice-core",
    title: "Ice Core",
    text: "想法占位：这里将放置一段值得回看的个人思考。",
  },
  {
    id: "signal",
    title: "Signal",
    text: "探索占位：这里将更新最近阅读、观察或尝试的事物。",
  },
];
export type Project = {
  title: string;
  description: string;
  status: string;
  tags: string[];
  cover?: string;
  href?: string;
};
export const projects: Project[] = [
  {
    title: "下一座研究站",
    description: "项目资料待补充。这里将记录问题、过程与成果。",
    status: "占位 · 尚未发布",
    tags: [],
  },
];

export const exploring = [
  { title: "Engineering", text: "待补充：由记录者维护近期的工程探索。" },
  { title: "Reading", text: "待补充：由记录者维护近期的阅读记录。" },
  { title: "Thoughts", text: "待补充：由记录者维护尚未成形的想法。" },
];
