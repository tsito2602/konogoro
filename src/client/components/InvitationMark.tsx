import { Mail } from "lucide-react";

export function InvitationMark() {
  return (
    <div className="invitation-mark" aria-hidden>
      <span className="invitation-seal">
        <Mail />
      </span>
      <span>
        このごろ<small>家族への招待</small>
      </span>
    </div>
  );
}
