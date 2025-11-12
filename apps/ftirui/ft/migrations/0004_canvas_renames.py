from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('ft', '0003_dashboard_models'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='workspaceboardversion',
            options={
                'ordering': ['-created_at'],
                'indexes': [],
            },
        ),
        migrations.RenameModel(
            old_name='WorkspaceBoard',
            new_name='WorkspaceCanvas',
        ),
        migrations.RenameModel(
            old_name='WorkspaceBoardVersion',
            new_name='WorkspaceCanvasVersion',
        ),
        migrations.RenameField(
            model_name='workspacecanvasversion',
            old_name='board',
            new_name='canvas',
        ),
        migrations.AlterField(
            model_name='workspacecanvas',
            name='owner',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='workspace_canvases',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='workspacecanvas',
            name='project',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='canvases',
                to='ft.workspaceproject',
            ),
        ),
        migrations.AlterField(
            model_name='workspacecanvasversion',
            name='canvas',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='versions',
                to='ft.workspacecanvas',
            ),
        ),
        migrations.AlterField(
            model_name='workspacecanvasversion',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='workspace_canvas_versions',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterModelOptions(
            name='workspacecanvasversion',
            options={
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['canvas', 'created_at'], name='ft_workspace_canvas_created_idx'),
                ],
            },
        ),
    ]
