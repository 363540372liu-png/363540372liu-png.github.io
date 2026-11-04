/**
 * Deliberately curated portfolio. Adding a GitHub repository to the account
 * does not publish it automatically on Polar Explorer.
 *
 * Metadata (language and last code push) is refreshed at build time.
 * Titles, summaries, tags and project status stay editorially controlled.
 */
export type ProjectSelection = {
  id: string;
  repo: string;
  title: string;
  description: string;
  status: string;
  category: string;
  tags: string[];
  detailPath?: string;
  cover?: string;
};

export type PortfolioProject = ProjectSelection & {
  href: string;
  detailHref?: string;
  language?: string;
  pushedAt?: string;
};

const owner = "363540372liu-png";

export const selectedProjects: ProjectSelection[] = [
  {
    id: "fpga-edge",
    repo: "FPGA-image-edge-detection-system-based-on-Ti60F225",
    title: "FPGA 实时图像边缘检测系统",
    description:
      "基于 Ti60F225、OV5640 与 DDR3 的图像处理流水线。从 Sobel 演进到全局 Canny，记录硬件实现、性能优化和上板验证的边界。",
    status: "P4 验收基线已归档",
    category: "HARDWARE / IMAGE PROCESSING",
    tags: ["FPGA", "Verilog", "Canny", "DDR3"],
    detailPath: "docs/development-process.zh-CN.md",
  },
  {
    id: "ic-pathway",
    repo: "ic-pathway",
    title: "芯路 · 数字 IC 学习室",
    description:
      "面向数字 IC 初学者的交互式学习项目，包含 Verilog RTL、仿真验证和综合基础，持续扩充中文课程、练习与学习进度功能。",
    status: "持续迭代",
    category: "EDUCATION / DIGITAL IC",
    tags: ["Verilog", "数字 IC", "EDA", "交互教学"],
    detailPath: "README.md",
  },
];

type GitHubRepo = {
  full_name?: string;
  private?: boolean;
  language?: string | null;
  pushed_at?: string | null;
};

async function syncProject(
  selected: ProjectSelection
): Promise<PortfolioProject | null> {
  const expected = owner + "/" + selected.repo;
  const href = "https://github.com/" + expected;
  const fallback: PortfolioProject = {
    ...selected,
    href,
    detailHref: selected.detailPath
      ? href + "/blob/main/" + selected.detailPath
      : undefined,
  };

  try {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetch(
      "https://api.github.com/repos/" +
        encodeURIComponent(owner) +
        "/" +
        encodeURIComponent(selected.repo),
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    // A formerly public repository may be deleted or made private. Do not
    // continue publishing it when GitHub explicitly reports that it is gone.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("GitHub API: " + response.status);

    const data = (await response.json()) as GitHubRepo;
    if (data.private || data.full_name !== expected) return null;

    const pushedAt =
      typeof data.pushed_at === "string" &&
      !Number.isNaN(Date.parse(data.pushed_at))
        ? data.pushed_at
        : undefined;

    return {
      ...fallback,
      language: typeof data.language === "string" ? data.language : undefined,
      pushedAt,
    };
  } catch {
    // A failed API request must not turn the static portfolio into an empty
    // page. Never fabricate dates, languages or engagement statistics.
    return fallback;
  }
}

let pendingProjects: Promise<PortfolioProject[]> | undefined;

/** Invoked during Astro static generation, never in the visitor's browser. */
export function getProjects(): Promise<PortfolioProject[]> {
  pendingProjects ??= Promise.all(selectedProjects.map(syncProject)).then(
    projects =>
      projects.filter(
        (project): project is PortfolioProject => project !== null
      )
  );
  return pendingProjects;
}
