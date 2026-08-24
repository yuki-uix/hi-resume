/**
 * The "which versions will shrink" notice shown in a master-side delete confirm.
 * Pure presentation: the caller computes the affected variant names through the
 * real read path (`affectedVariantsByEntry` / `ByBullet` / `BySection`), and this
 * component renders nothing when the list is empty — so a deletion that no
 * variant inherits stays quiet (issue #26 AC2).
 */
export function VariantImpactNotice({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <p className="dialog__text dialog__text--impact" data-testid="delete-impact">
      删除后，以下岗位版本会因此变短：{names.join('、')}
    </p>
  )
}
