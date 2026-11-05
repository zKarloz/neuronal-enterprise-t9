"""M09: informes autorizados de proyectos remotos sin exponer CSV originales.

REST/CSV/PDF comparten el mismo snapshot persistido. La base de datos es fuente
única de verdad; nunca se generan métricas de ejemplo en los reportes.
"""
from datetime import datetime, timezone
from io import BytesIO, StringIO
from uuid import UUID
import csv
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from app.api.projects import one
from app.core.auth import current_user, Identity
from app.core.database import get_db
from app.models.entities import (ArchitectureRecord, AuditEvent, DatasetRecord,
                                 ModelVersion, TrainingJob, TrainingMetric)

router = APIRouter(prefix="/projects/{project_id}/reports", tags=["reports"])


def snapshot(db: Session, project_id: UUID, identity: Identity) -> dict:
    """Valida acceso y reúne un resumen acotado, sin storage_key ni datos originales."""
    project = one(db, project_id, identity)
    architectures = db.scalars(select(ArchitectureRecord).where(
        ArchitectureRecord.project_id == project_id).order_by(
        ArchitectureRecord.created_at.desc()).limit(200)).all()
    datasets = db.scalars(select(DatasetRecord).where(
        DatasetRecord.project_id == project_id).order_by(
        DatasetRecord.created_at.desc()).limit(200)).all()
    jobs = db.scalars(select(TrainingJob).where(
        TrainingJob.project_id == project_id).order_by(
        TrainingJob.created_at.desc()).limit(200)).all()
    models = db.scalars(select(ModelVersion).where(
        ModelVersion.project_id == project_id).order_by(
        ModelVersion.created_at.desc()).limit(200)).all()
    # Los límites protegen a Render de reportes que crezcan indefinidamente.
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": {"id": str(project.id), "name": project.name,
                    "description": project.description, "status": project.status},
        "architectures": [{"id": str(a.id), "name": a.name, "version": a.version,
                            "family": a.family, "configuration": a.config_json} for a in architectures],
        "datasets": [{"id": str(d.id), "name": d.name, "version": d.version,
                      "rows": d.row_count, "columns": d.column_count,
                      "prepared": bool(d.prep_json), "sha256": d.sha256} for d in datasets],
        "jobs": [{"id": str(j.id), "architecture_id": str(j.architecture_id),
                  "dataset_id": str(j.dataset_id), "status": j.status, "epochs": j.epochs,
                  "epochs_executed": j.epoch, "early_stopping_patience": j.early_stopping_patience,
                  "created_at": j.created_at.isoformat() if j.created_at else None,
                  "ended_at": j.ended_at.isoformat() if j.ended_at else None} for j in jobs],
        "models": [{"id": str(m.id), "job_id": str(m.job_id), "name": m.name,
                    "stage": m.stage, "sha256": m.sha256,
                    "best_epoch": m.best_epoch, "epochs_trained": m.epochs_trained,
                    "test_metrics": m.test_metrics} for m in models],
        "limited_to": 200,
    }


def audit(db: Session, project_id: UUID, identity: Identity, action: str) -> None:
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action=action))
    db.commit()


@router.get("/summary")
def report_summary(project_id: UUID, identity: Identity = Depends(current_user),
                   db: Session = Depends(get_db)):
    # El resumen es de solo lectura y está limitado a proyectos accesibles.
    return snapshot(db, project_id, identity)


def csv_safe(value: object) -> str:
    """Desactiva fórmulas de planillas introducidas como nombres de recursos."""
    text = str(value if value is not None else "")
    if text.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


@router.get("/epochs.csv")
def export_epochs(project_id: UUID, identity: Identity = Depends(current_user),
                  db: Session = Depends(get_db)):
    one(db, project_id, identity)
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["job_id", "architecture", "dataset", "epoch", "loss", "val_loss",
                     "accuracy", "val_accuracy"])
    jobs = db.scalars(select(TrainingJob).where(
        TrainingJob.project_id == project_id).order_by(
        TrainingJob.created_at.desc()).limit(200)).all()
    for job in jobs:
        arch = db.get(ArchitectureRecord, job.architecture_id)
        dataset = db.get(DatasetRecord, job.dataset_id)
        for metric in db.scalars(select(TrainingMetric).where(
                TrainingMetric.job_id == job.id).order_by(TrainingMetric.epoch)).all():
            writer.writerow([str(job.id), csv_safe(arch.name if arch else ""),
                             csv_safe(dataset.name if dataset else ""), metric.epoch,
                             metric.loss, metric.val_loss,
                             metric.accuracy if metric.accuracy is not None else "",
                             metric.val_accuracy if metric.val_accuracy is not None else ""])
    audit(db, project_id, identity, "report.csv_exported")
    return Response(content="\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="neurolab-metricas-{project_id}.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


def make_pdf(data: dict) -> bytes:
    """Ficha ejecutiva A4 y trazabilidad de los primeros 30 trabajos."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=(595.28, 841.89), rightMargin=42,
                            leftMargin=42, topMargin=45, bottomMargin=48)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="NeuroTitle", parent=styles["Heading1"],
                              fontSize=21, leading=27, textColor=colors.HexColor("#172B4D"), spaceAfter=12))
    styles.add(ParagraphStyle(name="NeuroSmall", parent=styles["BodyText"],
                              fontSize=8.5, leading=13, textColor=colors.HexColor("#41536B")))
    styles.add(ParagraphStyle(name="NeuroFooter", parent=styles["BodyText"],
                              fontSize=8, alignment=TA_CENTER, textColor=colors.grey))

    def p(value: object) -> Paragraph:
        # Escapar todo texto introducido por usuarios; ReportLab interpreta markup.
        return Paragraph(escape(str(value or "")), styles["NeuroSmall"])

    story = [Paragraph("NeuroLab Enterprise", styles["NeuroTitle"]),
             p("Ficha de proyecto y resultados de entrenamiento"), Spacer(1, 13),
             Paragraph("Proyecto", styles["Heading2"]), p(data["project"]["name"]),
             p(data["project"]["description"]), Spacer(1, 10),
             p("Generado (UTC): " + data["generated_at"]), Spacer(1, 13)]
    counts = [("Arquitecturas", len(data["architectures"])),
              ("Datasets", len(data["datasets"])),
              ("Trabajos", len(data["jobs"])),
              ("Modelos", len(data["models"]))]
    grid = Table([[p(name), p(count)] for name, count in counts], colWidths=[250, 200])
    grid.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5FA")),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                              ("TOPPADDING", (0, 0), (-1, -1), 8)]))
    story += [grid, Spacer(1, 16)]
    # M04/M05: ficha resumida, sin secretos ni muestras del dataset.
    story.append(Paragraph("Resumen de arquitecturas", styles["Heading2"]))
    if data["architectures"]:
        for architecture in data["architectures"][:12]:
            story.append(p(f'{architecture["name"]} · v{architecture["version"]} · {architecture["family"]}'))
    else:
        story.append(p("Sin arquitecturas guardadas"))
    story.append(Spacer(1, 12))
    story.append(Paragraph("Datasets registrados", styles["Heading2"]))
    if data["datasets"]:
        for dataset in data["datasets"][:12]:
            story.append(p(f'{dataset["name"]}: {dataset["rows"]} registros, '
                           f'{dataset["columns"]} columnas · '
                           f'{"preparado" if dataset["prepared"] else "pendiente"}'))
    else:
        story.append(p("Sin datasets importados"))
    story.append(Spacer(1, 14))
    story.append(Paragraph("Modelos registrados", styles["Heading2"]))
    if data["models"]:
        for model in data["models"][:12]:
            story.append(p(f'{model["name"]} · {model["stage"]} · '
                           f'test: {model["test_metrics"]}'))
    else:
        story.append(p("Sin modelos registrados"))
    story.append(Spacer(1, 14))
    story.append(Paragraph("Historial de entrenamientos", styles["Heading2"]))
    rows = [[p("Fecha (UTC)"), p("Estado"), p("Épocas")]]
    for job in data["jobs"][:30]:
        rows.append([p((job["created_at"] or "")[:19]), p(job["status"]),
                     p(f'{job["epochs_executed"]}/{job["epochs"]}')])
    if len(rows) == 1:
        rows.append([p("Sin entrenamientos registrados"), p("—"), p("—")])
    table = Table(rows, colWidths=[250, 125, 125], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DCE8FA")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FB")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [table, Spacer(1, 14), p("Resumen: hasta 200 elementos por categoría y 30 trabajos en el PDF. "
                                           "CSV disponible para las métricas completas de los trabajos incluidos. "
                                           "No contiene datos originales ni credenciales."),
              Spacer(1, 10), p("Informe informativo. El estado producción en el registro no despliega inferencia.")]

    def footer(canvas, document):
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawCentredString(297, 26, f"NeuroLab Enterprise | página {document.page}")

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


@router.get("/project.pdf")
def export_project_pdf(project_id: UUID, identity: Identity = Depends(current_user),
                       db: Session = Depends(get_db)):
    report = snapshot(db, project_id, identity)
    content = make_pdf(report)
    audit(db, project_id, identity, "report.pdf_exported")
    return Response(content=content, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="neurolab-proyecto-{project_id}.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })
