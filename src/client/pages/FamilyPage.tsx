import { EmptyState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

export function FamilyPage() {
  return <><PageHeader title="家族" /><main className="page-content"><EmptyState title="Phase 2で利用できます" body="招待と家族メンバー管理はLINE Loginと一緒に実装します。" /></main></>;
}
