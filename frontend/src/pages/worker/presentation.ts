/**
 * Workshop Presentation Layer — environmentMode → UI 表示方針の静的マッピング。
 * presentation layer only。piece data を持ち込まない。
 *
 * WorkshopPage 内に `environmentMode === 'recovery'` 等の直接比較を書かない。
 * 新しい mode が増えたときはここに1行追加するだけ。
 * HeroPresentation に新フィールドを追加するのは「environmentMode から静的に導出できる表示方針」のみ。
 */

import type { EnvironmentMode } from '../../projections/flowecology/types';

/** HeroPieceCard に渡す表示制御オブジェクト。個別 props の散らばりを防ぐ */
export type HeroPresentation = {
  restartEmphasized: boolean;
  objectiveCollapsed: boolean;
};

export const ENV_PRESENTATION: Record<EnvironmentMode, {
  /** repair_shelf を collapsed default にする（visible の場合のみ引き下げ） */
  repairDefaultCollapsed: boolean;
  /** HeroPieceCard に渡す表示制御 */
  hero: HeroPresentation;
}> = {
  open:      { repairDefaultCollapsed: false, hero: { restartEmphasized: false, objectiveCollapsed: true  } },
  focused:   { repairDefaultCollapsed: false, hero: { restartEmphasized: false, objectiveCollapsed: true  } },
  protected: { repairDefaultCollapsed: false, hero: { restartEmphasized: false, objectiveCollapsed: true  } },
  recovery:  { repairDefaultCollapsed: true,  hero: { restartEmphasized: true,  objectiveCollapsed: false } },
  shelter:   { repairDefaultCollapsed: true,  hero: { restartEmphasized: true,  objectiveCollapsed: false } },
};
