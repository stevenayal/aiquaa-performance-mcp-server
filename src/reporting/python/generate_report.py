#!/usr/bin/env python3
"""Genera el informe PDF de una ejecución JMeter y evalúa sus thresholds.

Réplica en Python de src/results/jtl.ts + src/thresholds/evaluate.ts para que el
workflow no necesite Node: mismas métricas (percentil por rango, error rate en %),
mismo formato de thresholds.json ({"global": {...}, "operations": {label: {...}}})
y mismos veredictos (PASS, FAIL, INCONCLUSIVE, NOT_EXECUTED).

Uso:
  python3 generate_report.py --jtl R.jtl --thresholds thresholds.json --output INFORME.pdf \
      [--summary-json summary.json] [--api-name X] [--test-type load] [--threads 20] \
      [--target-per-min 2400] [--plan P.jmx] [--repo-url URL] \
      [--evidence-image img.png --evidence-label L --evidence-url URL] [--no-fail]

Sale con código 1 si el veredicto global es FAIL o NOT_EXECUTED (salvo --no-fail),
siempre después de escribir el PDF, para que el artifact exista aunque el gate falle.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import sys
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from typing import Dict, List, Optional

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_CENTER  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

THRESHOLD_KEYS = OrderedDict(
    [
        ("maxErrorRate", ("errorRate", "Error rate", "%")),
        ("averageMs", ("averageMs", "Promedio", "ms")),
        ("p90Ms", ("p90Ms", "P90", "ms")),
        ("p95Ms", ("p95Ms", "P95", "ms")),
        ("p99Ms", ("p99Ms", "P99", "ms")),
        ("maxMs", ("maxMs", "Máximo", "ms")),
    ]
)
VERDICT_COLORS = {
    "PASS": colors.HexColor("#1a7f37"),
    "FAIL": colors.HexColor("#cf222e"),
    "INCONCLUSIVE": colors.HexColor("#9a6700"),
    "NOT_EXECUTED": colors.HexColor("#57606a"),
}
ACCENT = colors.HexColor("#0b3d91")


# --------------------------------------------------------------------------- datos
def load_samples(path: str) -> List[dict]:
    samples = []
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            try:
                timestamp = float(row.get("timeStamp") or row.get("timestamp") or "")
                elapsed = float(row.get("elapsed") or "")
            except ValueError:
                continue
            samples.append(
                {
                    "timestamp": timestamp,
                    "elapsed": elapsed,
                    "label": row.get("label") or "unknown",
                    "success": (row.get("success") or "false").lower() == "true",
                    "code": row.get("responseCode") or row.get("code") or "",
                    "message": row.get("responseMessage") or row.get("message") or "",
                    "bytes": float(row.get("bytes") or 0) or 0,
                    "url": row.get("URL") or row.get("url") or "",
                }
            )
    samples.sort(key=lambda s: s["timestamp"])
    return samples


def load_thresholds(path: str) -> Dict[str, dict]:
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    result = {}
    if isinstance(raw.get("global"), dict):
        result["global"] = raw["global"]
    for label, value in (raw.get("operations") or {}).items():
        result[label] = value
    return result


def percentile(sorted_values: List[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    rank = math.ceil((p / 100) * len(sorted_values)) - 1
    return sorted_values[max(0, rank)]


def metrics(samples: List[dict], label: str) -> dict:
    elapsed = sorted(s["elapsed"] for s in samples)
    failures = sum(1 for s in samples if not s["success"])
    seconds = (
        max(0.001, (samples[-1]["timestamp"] - samples[0]["timestamp"]) / 1000)
        if len(samples) > 1
        else 0
    )
    return {
        "label": label,
        "samples": len(samples),
        "successes": len(samples) - failures,
        "failures": failures,
        "errorRate": (failures / len(samples) * 100) if samples else 0.0,
        "throughput": (len(samples) / seconds) if seconds else 0.0,
        "averageMs": (sum(elapsed) / len(elapsed)) if elapsed else 0.0,
        "medianMs": percentile(elapsed, 50),
        "minMs": elapsed[0] if elapsed else 0.0,
        "maxMs": elapsed[-1] if elapsed else 0.0,
        "p90Ms": percentile(elapsed, 90),
        "p95Ms": percentile(elapsed, 95),
        "p99Ms": percentile(elapsed, 99),
        "bytes": sum(s["bytes"] for s in samples),
    }


def verdict(metric: dict, threshold: Optional[dict]) -> str:
    if metric["samples"] == 0:
        return "NOT_EXECUTED"
    if not threshold:
        return "INCONCLUSIVE"
    for key, (field, _, _) in THRESHOLD_KEYS.items():
        limit = threshold.get(key)
        if limit is not None and metric[field] > limit:
            return "FAIL"
    return "PASS"


def analyze(samples: List[dict], thresholds: Dict[str, dict]) -> dict:
    overall = metrics(samples, "all")
    overall["verdict"] = verdict(overall, thresholds.get("global"))
    operations = []
    for label in OrderedDict.fromkeys(s["label"] for s in samples):
        op = metrics([s for s in samples if s["label"] == label], label)
        op["verdict"] = verdict(op, thresholds.get(label) or thresholds.get("global"))
        operations.append(op)
    # Una operación que falla su propio threshold hace fallar la corrida aunque el
    # agregado global pase.
    if overall["verdict"] == "PASS" and any(op["verdict"] == "FAIL" for op in operations):
        overall["verdict"] = "FAIL"
    errors = Counter(
        "{} {}".format(s["code"], s["message"]).strip() for s in samples if not s["success"]
    )
    overall["operations"] = operations
    overall["errors"] = dict(errors.most_common())
    if samples:
        overall["startedAt"] = iso(samples[0]["timestamp"])
        overall["endedAt"] = iso(samples[-1]["timestamp"])
        overall["durationSeconds"] = (samples[-1]["timestamp"] - samples[0]["timestamp"]) / 1000
    return overall


def timeline(samples: List[dict], max_buckets: int = 60) -> List[dict]:
    if not samples:
        return []
    t0 = samples[0]["timestamp"]
    duration = max(1.0, (samples[-1]["timestamp"] - t0) / 1000)
    bucket_seconds = max(1, math.ceil(duration / max_buckets))
    buckets: Dict[int, List[dict]] = {}
    for sample in samples:
        buckets.setdefault(int((sample["timestamp"] - t0) / 1000 // bucket_seconds), []).append(
            sample
        )
    result = []
    for index in range(max(buckets) + 1):
        items = buckets.get(index, [])
        elapsed = sorted(s["elapsed"] for s in items)
        result.append(
            {
                "t": index * bucket_seconds,
                "rps": len(items) / bucket_seconds,
                "errorsPerSec": sum(1 for s in items if not s["success"]) / bucket_seconds,
                "avgMs": (sum(elapsed) / len(elapsed)) if elapsed else None,
                "p95Ms": percentile(elapsed, 95) if elapsed else None,
            }
        )
    return result


def iso(timestamp_ms: float) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat()


# ------------------------------------------------------------------------- gráficas
def chart_png(fig) -> io.BytesIO:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return buffer


def response_time_chart(points: List[dict], p95_limit: Optional[float]) -> io.BytesIO:
    fig, ax = plt.subplots(figsize=(8, 3))
    xs = [p["t"] for p in points]
    ax.plot(xs, [p["avgMs"] for p in points], label="Promedio", color="#0b3d91", linewidth=1.6)
    ax.plot(xs, [p["p95Ms"] for p in points], label="P95", color="#e36209", linewidth=1.6)
    if p95_limit:
        ax.axhline(p95_limit, color="#cf222e", linestyle="--", linewidth=1, label="Umbral P95")
    ax.set_xlabel("Segundos desde el inicio")
    ax.set_ylabel("ms")
    ax.set_title("Tiempo de respuesta")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper right", fontsize=8)
    return chart_png(fig)


def throughput_chart(points: List[dict]) -> io.BytesIO:
    fig, ax = plt.subplots(figsize=(8, 3))
    xs = [p["t"] for p in points]
    ax.plot(xs, [p["rps"] for p in points], label="Requests/s", color="#1a7f37", linewidth=1.6)
    ax.bar(xs, [p["errorsPerSec"] for p in points], label="Errores/s", color="#cf222e", alpha=0.6,
           width=max(1, xs[1] - xs[0]) * 0.8 if len(xs) > 1 else 0.8)
    ax.set_xlabel("Segundos desde el inicio")
    ax.set_ylabel("req/s")
    ax.set_title("Throughput y errores")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper right", fontsize=8)
    return chart_png(fig)


# ---------------------------------------------------------------------------- PDF
def fmt_ms(value: float) -> str:
    return "{:,.0f} ms".format(value)


def table(data, col_widths, header=True, zebra=True) -> Table:
    result = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d7de")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5),
        ]
    if zebra:
        for row in range(1 if header else 0, len(data)):
            if row % 2 == 0:
                style.append(("BACKGROUND", (0, row), (-1, row), colors.HexColor("#f6f8fa")))
    result.setStyle(TableStyle(style))
    return result


def build_pdf(args, summary: dict, thresholds: Dict[str, dict], points: List[dict]) -> None:
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=ACCENT, fontSize=20)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=ACCENT, spaceBefore=10)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=body, fontSize=7.5, textColor=colors.HexColor("#57606a"))
    badge_style = ParagraphStyle(
        "badge", parent=body, fontSize=16, leading=20, alignment=TA_CENTER,
        textColor=colors.white, fontName="Helvetica-Bold",
    )

    story = [Paragraph("Informe de rendimiento", h1), Paragraph(esc(args.api_name), styles["Heading3"])]

    verdict_value = summary["verdict"]
    badge = Table([[Paragraph("Veredicto: " + verdict_value, badge_style)]], colWidths=[170 * mm])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), VERDICT_COLORS.get(verdict_value, ACCENT)),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [Spacer(1, 4 * mm), badge, Spacer(1, 4 * mm)]

    context = [
        ["Tipo de prueba", args.test_type or "—"],
        ["Usuarios concurrentes", str(args.threads) if args.threads else "—"],
        ["Throughput objetivo", "{} req/min".format(args.target_per_min) if args.target_per_min else "—"],
        ["Inicio (UTC)", summary.get("startedAt", "—")[:19].replace("T", " ")],
        ["Fin (UTC)", summary.get("endedAt", "—")[:19].replace("T", " ")],
        ["Duración observada", "{:.0f} s".format(summary.get("durationSeconds", 0))],
        ["Plan", args.plan or "—"],
        ["Documentación / repo", args.repo_url or "—"],
        ["Ejecución CI", ci_run_url() or "local"],
    ]
    story += [Paragraph("Contexto de la ejecución", h2),
              table([[k, Paragraph(esc(v), body)] for k, v in context], [55 * mm, 115 * mm], header=False)]

    story.append(Paragraph("Resultados globales vs. umbrales", h2))
    global_threshold = thresholds.get("global") or {}
    rows = [["Métrica", "Observado", "Umbral", "Estado"]]
    for key, (field, name, unit) in THRESHOLD_KEYS.items():
        value = summary[field]
        observed = "{:.2f} %".format(value) if unit == "%" else fmt_ms(value)
        limit = global_threshold.get(key)
        if limit is None:
            rows.append([name, observed, "—", "—"])
        else:
            rows.append([name, observed, ("≤ {} %" if unit == "%" else "≤ {} ms").format(limit),
                         "OK" if value <= limit else "EXCEDIDO"])
    rows += [
        ["Muestras", "{:,}".format(summary["samples"]), "—", "—"],
        ["Errores", "{:,}".format(summary["failures"]), "—", "—"],
        ["Throughput", "{:.2f} req/s ({:.0f} req/min)".format(summary["throughput"], summary["throughput"] * 60), "—", "—"],
        ["Mediana / Mín.", "{} / {}".format(fmt_ms(summary["medianMs"]), fmt_ms(summary["minMs"])), "—", "—"],
    ]
    metrics_table = table(rows, [45 * mm, 60 * mm, 35 * mm, 30 * mm])
    for index, row in enumerate(rows):
        if row[3] in ("OK", "EXCEDIDO"):
            metrics_table.setStyle(TableStyle([
                ("TEXTCOLOR", (3, index), (3, index), VERDICT_COLORS["PASS" if row[3] == "OK" else "FAIL"]),
                ("FONT", (3, index), (3, index), "Helvetica-Bold", 8.5),
            ]))
    story.append(metrics_table)

    story.append(Paragraph("Detalle por sampler", h2))
    op_rows = [["Sampler", "Muestras", "Error %", "Prom.", "P90", "P95", "P99", "req/s", "Veredicto"]]
    for op in summary["operations"]:
        op_rows.append([
            Paragraph(esc(op["label"]), body), "{:,}".format(op["samples"]), "{:.2f}".format(op["errorRate"]),
            "{:.0f}".format(op["averageMs"]), "{:.0f}".format(op["p90Ms"]), "{:.0f}".format(op["p95Ms"]),
            "{:.0f}".format(op["p99Ms"]), "{:.2f}".format(op["throughput"]), op["verdict"],
        ])
    story.append(table(op_rows, [44 * mm, 17 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 25 * mm]))
    story.append(Paragraph("Tiempos en ms.", small))

    if summary["errors"]:
        story.append(Paragraph("Distribución de errores", h2))
        err_rows = [["Código / mensaje", "Cantidad", "% de errores"]]
        for key, count in list(summary["errors"].items())[:15]:
            err_rows.append([Paragraph(esc(key or "(sin código)"), body), "{:,}".format(count),
                             "{:.1f} %".format(count / summary["failures"] * 100)])
        story.append(table(err_rows, [110 * mm, 30 * mm, 30 * mm]))

    if points:
        story += [PageBreak(), Paragraph("Evolución en el tiempo", h2),
                  Image(response_time_chart(points, global_threshold.get("p95Ms")), width=170 * mm, height=64 * mm),
                  Spacer(1, 4 * mm),
                  Image(throughput_chart(points), width=170 * mm, height=64 * mm)]

    if args.evidence_image and os.path.exists(args.evidence_image):
        from reportlab.lib.utils import ImageReader

        width, height = ImageReader(args.evidence_image).getSize()
        target_width = 170 * mm
        target_height = min(200 * mm, target_width * height / width)
        story += [PageBreak(), Paragraph(esc(args.evidence_label), h2)]
        if args.evidence_url:
            story.append(Paragraph("Fuente: " + esc(args.evidence_url), small))
        story += [Spacer(1, 3 * mm),
                  Image(args.evidence_image, width=target_height * width / height, height=target_height)]

    story += [Spacer(1, 6 * mm), Paragraph(
        "Métricas calculadas sobre el JTL completo: percentiles por rango (nearest-rank), error rate = "
        "muestras fallidas / total. Un sampler que excede su umbral hace fallar el veredicto global.", small)]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#57606a"))
        canvas.drawString(20 * mm, 10 * mm, "AIQUAA Performance · " + args.api_name)
        canvas.drawRightString(190 * mm, 10 * mm, "Página {}".format(doc.page))
        canvas.restoreState()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    SimpleDocTemplate(args.output, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=18 * mm, title="Informe de rendimiento",
                      author="AIQUAA Performance").build(story, onFirstPage=footer, onLaterPages=footer)


def esc(value: str) -> str:
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def ci_run_url() -> Optional[str]:
    if os.environ.get("GITHUB_RUN_ID"):
        return "{}/{}/actions/runs/{}".format(
            os.environ.get("GITHUB_SERVER_URL", "https://github.com"),
            os.environ.get("GITHUB_REPOSITORY", ""), os.environ["GITHUB_RUN_ID"])
    return None


def write_step_summary(args, summary: dict) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    lines = [
        "## {} — {}".format(args.api_name, summary["verdict"]), "",
        "| Muestras | Error % | Prom. | P90 | P95 | P99 | req/s |",
        "|---:|---:|---:|---:|---:|---:|---:|",
        "| {:,} | {:.2f} | {:.0f} | {:.0f} | {:.0f} | {:.0f} | {:.2f} |".format(
            summary["samples"], summary["errorRate"], summary["averageMs"], summary["p90Ms"],
            summary["p95Ms"], summary["p99Ms"], summary["throughput"]), "",
    ]
    if summary["errors"]:
        lines += ["**Errores:** " + ", ".join("`{}` × {}".format(k, v) for k, v in list(summary["errors"].items())[:5]), ""]
    lines.append("PDF: artifact `{}`".format(os.path.basename(args.output)))
    with open(path, "a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--jtl", required=True)
    parser.add_argument("--thresholds", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary-json")
    parser.add_argument("--api-name", default="API")
    parser.add_argument("--test-type")
    parser.add_argument("--threads", type=int)
    parser.add_argument("--target-per-min", type=int)
    parser.add_argument("--plan")
    parser.add_argument("--repo-url")
    parser.add_argument("--evidence-image")
    parser.add_argument("--evidence-label", default="Evidencia de monitoreo")
    parser.add_argument("--evidence-url")
    parser.add_argument("--no-fail", action="store_true", help="No devolver código 1 si el veredicto es FAIL")
    args = parser.parse_args()

    samples = load_samples(args.jtl) if os.path.exists(args.jtl) else []
    thresholds = load_thresholds(args.thresholds)
    summary = analyze(samples, thresholds)
    build_pdf(args, summary, thresholds, timeline(samples))
    if args.summary_json:
        with open(args.summary_json, "w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2, ensure_ascii=False)
    write_step_summary(args, summary)

    print("Veredicto: {} | muestras={} error%={:.2f} p95={:.0f}ms p99={:.0f}ms req/s={:.2f}".format(
        summary["verdict"], summary["samples"], summary["errorRate"], summary["p95Ms"],
        summary["p99Ms"], summary["throughput"]))
    print("PDF: " + args.output)
    if summary["verdict"] in ("FAIL", "NOT_EXECUTED") and not args.no_fail:
        print("::error::Umbrales no cumplidos (veredicto {})".format(summary["verdict"]))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
