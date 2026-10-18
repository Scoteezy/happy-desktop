import { mathFormulaClassName, mathFormulaRender } from "./mathFormulaRender";

export type MathFormulaProps = {
    /** TeX source, without its `$`/`\(`/`\[` delimiters. */
    source: string;
    /** Display style on its own line, or inline in running text. */
    display: boolean;
};

/**
 * One TeX formula, typeset by KaTeX.
 *
 * KaTeX's markup is generated from the source with `trust` off, so it carries
 * no links, scripts, or arbitrary HTML and is inserted as is. Ink takes the
 * surrounding text colour, so a formula follows the theme and an own bubble's
 * on-accent text. A formula KaTeX cannot parse shows its source as code with a
 * soft wavy underline, and the parser's reason on hover; it never throws.
 *
 * A display formula never wraps. Its host decides how it scrolls when it is
 * wider than the measure.
 */
export function MathFormula(props: MathFormulaProps) {
    const rendered = mathFormulaRender(props.source, props.display);
    if (rendered.kind === "failed") {
        const code = (
            <code
                className="happy-math-error"
                data-happy-desktop-ui="math-formula-error"
                title={rendered.message}
            >
                {props.source}
            </code>
        );
        return props.display ? <pre className="happy-math-error-block">{code}</pre> : code;
    }
    const markup = { __html: rendered.html };
    return props.display ? (
        <div
            className={mathFormulaClassName(true)}
            dangerouslySetInnerHTML={markup}
            data-happy-desktop-ui="math-formula"
        />
    ) : (
        <span
            className={mathFormulaClassName(false)}
            dangerouslySetInnerHTML={markup}
            data-happy-desktop-ui="math-formula"
        />
    );
}
