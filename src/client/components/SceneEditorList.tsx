import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { moveItemByOffset, useSceneReorder } from "../hooks/useMediaReorder";

type Scene = { id: string; title: string };

export function SceneEditorList({
  scenes,
  disabled,
  onOrder,
  onTitle,
  onDelete,
}: {
  scenes: Scene[];
  disabled: boolean;
  onOrder: (ids: string[]) => void;
  onTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { gridRef, announcement } = useSceneReorder(
    scenes.map((scene) => scene.id),
    onOrder,
    disabled || !editing,
  );
  return (
    <>
      <div className="management-heading scene-management-heading">
        <h2>見出し</h2>
        <button
          type="button"
          className="text-button"
          aria-pressed={editing}
          disabled={disabled}
          onClick={() => setEditing((current) => !current)}
        >
          {!editing && <Pencil aria-hidden="true" />} {editing ? "完了" : "編集"}
        </button>
      </div>
      <div className="scene-list" ref={gridRef}>
        {scenes.map((scene, index) => (
          <div
            className={`scene-editor${editing ? " scene-editor-editing" : ""}`}
            data-scene-id={scene.id}
            key={scene.id}
          >
            {editing && (
              <button
                type="button"
                className="icon-button scene-drag-handle"
                data-scene-handle=""
                disabled={disabled}
                aria-label={`見出し「${scene.title}」を並び替え`}
                aria-describedby="scene-drag-instructions"
                onKeyDown={(event) => {
                  if (disabled || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                  event.preventDefault();
                  onOrder(
                    moveItemByOffset(
                      scenes.map((item) => item.id),
                      index,
                      event.key === "ArrowUp" ? -1 : 1,
                    ),
                  );
                }}
              >
                <GripVertical aria-hidden="true" />
              </button>
            )}
            <input
              aria-label={`見出し${index + 1}の名前`}
              placeholder="例: 2日目 午前（午後）"
              value={scene.title}
              maxLength={100}
              disabled={disabled}
              onChange={(event) => onTitle(scene.id, event.target.value)}
            />
            {editing && (
              <button
                type="button"
                className="icon-button"
                disabled={disabled}
                aria-label={`見出し「${scene.title}」を削除`}
                onClick={() => onDelete(scene.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <p className="muted scene-reorder-hint" id="scene-drag-instructions">
          左端のハンドルをドラッグして並び替え。変更は保存するまで確定しません。
        </p>
      )}
      <span className="media-reorder-status" role="status">
        {announcement}
      </span>
    </>
  );
}
