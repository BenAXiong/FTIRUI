# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['run_local.py'],
    pathex=[],
    binaries=[],
    datas=[('C:\\Users\\Ben\\Documents\\Projects\\MLIR\\mlirui\\apps\\ftirui\\ft\\templates\\ft', 'ft/templates'), ('C:\\Users\\Ben\\Documents\\Projects\\MLIR\\mlirui\\apps\\ftirui\\ft\\static\\ft', 'ft/static/ft'), ('C:\\Users\\Ben\\miniconda3\\envs\\mlirui\\Lib\\site-packages\\matplotlib\\mpl-data', 'matplotlib/mpl-data')],
    hiddenimports=['whitenoise', 'whitenoise.middleware', 'whitenoise.storage', 'openpyxl', 'mpl_toolkits', 'pandas._libs.tslibs.timedeltas', 'pandas._libs.tslibs.nattype', 'pandas._libs.tslibs.np_datetime', 'matplotlib.backends.backend_agg'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ML-FTIR',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
