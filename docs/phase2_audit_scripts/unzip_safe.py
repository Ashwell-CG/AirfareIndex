import sys, zipfile, pathlib
for d in sys.argv[1:]:
    d = pathlib.Path(d).resolve(); z = zipfile.ZipFile(d/"ds.zip")
    for i in z.infolist():
        t = (d/i.filename).resolve()
        assert d in t.parents or t == d, f"unsafe path {i.filename}"
    z.extractall(d); print(d.name, [(i.filename, i.file_size) for i in z.infolist()])
