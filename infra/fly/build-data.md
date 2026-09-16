# Building the geo data (one-time, and after big OSM updates)

Both self-hosted services read from a Fly volume. Build the data on a beefier
temporary machine or locally, then copy it onto the volume.

## Source extract

```sh
# Illinois extract from Geofabrik, then clip to the Chicago bbox with osmium.
curl -LO https://download.geofabrik.de/north-america/us/illinois-latest.osm.pbf
osmium extract -b -87.94,41.64,-87.52,42.03 illinois-latest.osm.pbf -o chicago.osm.pbf
```

## Valhalla tiles

```sh
mkdir -p infra/data/valhalla && cp chicago.osm.pbf infra/data/valhalla/
docker compose -f infra/docker-compose.yml --profile geo up valhalla   # builds tiles on first run
# When it logs "Valhalla is ready", infra/data/valhalla/ holds valhalla_tiles.tar + config.
```

Copy to Fly:

```sh
flyctl ssh sftp shell --app chicago-valhalla
# > put infra/data/valhalla/valhalla_tiles.tar /custom_files/valhalla_tiles.tar
# > put infra/data/valhalla/valhalla.json /custom_files/valhalla.json
flyctl apps restart chicago-valhalla
```

## Photon index

Photon's stock import needs a Nominatim database, which is heavy. The practical
route for a city-sized area:

```sh
# Option A (recommended): nominatim-docker with the Chicago extract, then photon -nominatim-import.
# Option B: download the worldwide Photon dump and it is ~80 GB — not for a 5 GB volume.
docker run --rm -v $PWD/infra/data/nominatim:/data -v $PWD/chicago.osm.pbf:/chicago.osm.pbf \
  -e PBF_PATH=/chicago.osm.pbf -p 8080:8080 mediagis/nominatim:4.4
# Then, from the photon jar:
java -jar photon.jar -nominatim-import -host localhost -port 5432 -database nominatim -user nominatim -password nominatim -languages en
# Produces ./photon_data — copy it to the chicago-photon volume the same way as above.
```

Budget a few hours for the Nominatim import on a laptop. Keep the resulting
`photon_data` directory around; re-importing is slower than re-copying.

## Sizing

Starting points are in each `fly.toml`. Photon in particular may need more than
2 GB during the first index load; scale up temporarily with
`flyctl scale memory 4096 --app chicago-photon` and back down once it's serving.
