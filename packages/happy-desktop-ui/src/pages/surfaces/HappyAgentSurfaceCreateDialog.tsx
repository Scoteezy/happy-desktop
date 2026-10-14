import { useRef, useState, type CSSProperties } from "react";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { TextField } from "../../TextField";

/** The pictures the daemon accepts, and how large one may be. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_BYTES_LIMIT = 8 * 1024 * 1024;

export interface HappyAgentSurfaceCreateInput {
    readonly name: string;
    readonly image?: File;
}

export type HappyAgentSurfaceCreateDialogProps = {
    /** True while the Happy Agent has the request and has not answered. */
    pending: boolean;
    /** Why the last attempt was refused, in the Happy Agent's own words. */
    error?: string;
    onSubmit: (input: HappyAgentSurfaceCreateInput) => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

interface Picture {
    readonly file: File;
    /** The picture read into a data URL, for the preview. */
    readonly preview: string;
}

/**
 * C-298 HappyAgentSurfaceCreateDialog — names a new todo list and, if the
 * reader wants, gives it a picture.
 *
 * The form is the dialog's own until it is submitted: the name typed, the
 * picture chosen and its preview. The owner hears only the finished request
 * and answers with whether it is still running and why it was refused.
 */
export function HappyAgentSurfaceCreateDialog(props: HappyAgentSurfaceCreateDialogProps) {
    const [name, setName] = useState("");
    const [picture, setPicture] = useState<Picture>();
    const [pictureError, setPictureError] = useState<string>();
    const fileInput = useRef<HTMLInputElement>(null);
    const ready = name.trim().length > 0 && !props.pending;
    const submit = () => {
        if (!ready) return;
        props.onSubmit({ name: name.trim(), ...(picture ? { image: picture.file } : {}) });
    };
    const choose = (file: File | undefined) => {
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) {
            setPictureError("Choose a PNG, JPEG, or WebP picture.");
            return;
        }
        if (file.size > IMAGE_BYTES_LIMIT) {
            setPictureError("Choose a picture no larger than 8 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            setPictureError(undefined);
            setPicture({ file, preview: reader.result });
        };
        reader.onerror = () => setPictureError("That picture could not be read.");
        reader.readAsDataURL(file);
    };
    return (
        <ModalOverlay onDismiss={props.pending ? undefined : props.onClose}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        <Button disabled={props.pending} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            data-testid="happy-agent-surface-create-submit"
                            disabled={!ready}
                            loading={props.pending}
                            onClick={submit}
                            variant="primary"
                        >
                            Create
                        </Button>
                    </>
                }
                icon="tasks"
                onClose={props.onClose}
                size="medium"
                style={props.style}
                title="New todo list"
            >
                <div
                    className="happy-agent-surface-create-dialog"
                    data-happy-desktop-ui="happy-agent-surface-create-dialog"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Couldn’t make the list">
                            {props.error}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        data-testid="happy-agent-surface-create-name"
                        disabled={props.pending}
                        fullWidth
                        label="Name"
                        onSubmit={submit}
                        onValueChange={setName}
                        placeholder="Groceries"
                        value={name}
                    />
                    <div className="happy-agent-surface-create-dialog__picture">
                        <span
                            className="happy-agent-surface-create-dialog__preview"
                            data-happy-desktop-ui="happy-agent-surface-create-dialog-preview"
                        >
                            {picture ? (
                                <img alt="" draggable={false} src={picture.preview} />
                            ) : (
                                <Icon name="image" size={20} />
                            )}
                        </span>
                        <span className="happy-agent-surface-create-dialog__picture-text">
                            <span className="happy-agent-surface-create-dialog__picture-label">
                                Picture
                            </span>
                            <span
                                className="happy-agent-surface-create-dialog__picture-hint"
                                data-invalid={pictureError ? "" : undefined}
                            >
                                {pictureError ?? "Optional, up to 8 MB."}
                            </span>
                        </span>
                        {picture ? (
                            <Button
                                disabled={props.pending}
                                onClick={() => setPicture(undefined)}
                                size="small"
                                variant="ghost"
                            >
                                Remove
                            </Button>
                        ) : null}
                        <Button
                            disabled={props.pending}
                            onClick={() => fileInput.current?.click()}
                            size="small"
                            variant="secondary"
                        >
                            {picture ? "Change…" : "Choose…"}
                        </Button>
                        <input
                            accept={IMAGE_TYPES.join(",")}
                            className="happy-agent-surface-create-dialog__file"
                            data-testid="happy-agent-surface-create-file"
                            hidden
                            onChange={(event) => {
                                choose(event.currentTarget.files?.[0]);
                                event.currentTarget.value = "";
                            }}
                            ref={fileInput}
                            type="file"
                        />
                    </div>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
