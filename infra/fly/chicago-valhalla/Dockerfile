# Valhalla routing. Tiles for the Chicago extract are built once into the
# volume at /custom_files (see ../build-data.md).
FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest
ENV serve_tiles=True \
    build_elevation=False \
    build_admins=True \
    build_time_zones=True \
    build_transit=False \
    force_rebuild=False \
    use_tiles_ignore_pbf=True
VOLUME /custom_files
EXPOSE 8002
