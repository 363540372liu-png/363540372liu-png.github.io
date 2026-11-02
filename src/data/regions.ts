import positions from "./region-positions.json";
export const regionIds = [
  "dry-valleys",
  "station-1810",
  "port-lockroy",
  "inaccessibility",
] as const;
export const regions = [
  {
    id: "dry-valleys",
    recordLabel: "FIELD RESEARCH",
    motto: "从问题出发，留下可以复查的记录。",
    name: "麦克默多干谷",
    english: "McMurdo Dry Valleys",
    color: "#477C93",
    symbol: "△",
    description:
      "学习与研究的野外笔记。记录科学见闻、技术知识、工程实践和仍在追问的问题。",
    location: "77°S, 162°E · 区域代表位置",
    fictional: false,
  },
  {
    id: "station-1810",
    recordLabel: "STATION NOTES",
    motto: "为尚未整理好的想法，留一处停靠。",
    name: "1810号科考站",
    english: "Station 1810",
    color: "#A17D67",
    symbol: "⌂",
    description:
      "为内心留一处停靠。谈心、生活感悟、成长与不必急着得出结论的想法。",
    location: "虚构科考站 · 非真实地理设施",
    fictional: true,
  },
  {
    id: "port-lockroy",
    recordLabel: "WORLD OBSERVATIONS",
    motto: "从一座港口，望向不断变化的世界。",
    name: "洛克罗伊港",
    english: "Port Lockroy",
    color: "#506D7B",
    symbol: "≈",
    description:
      "从一座港口望向世界。记录社会、经济、文化和时代变化中的个人观察。",
    location: "64°49′S, 63°30′W · 近似位置",
    fictional: false,
  },
  {
    id: "inaccessibility",
    recordLabel: "OPEN COORDINATES",
    motto: "留白也是地图的一部分。",
    name: "不可接近之极",
    english: "Pole of Inaccessibility",
    color: "#8984A5",
    symbol: "⊙",
    description: "一块尚未定义的探索区域。保留空白，等待未来由记录者决定方向。",
    location: "约83°S, 55°E · 采用参考定义",
    fictional: false,
  },
].map(region => ({
  ...region,
  position: positions[region.id as keyof typeof positions],
}));
