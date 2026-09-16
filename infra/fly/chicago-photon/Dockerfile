# Photon geocoder (komoot). The Chicago index is built once (see ../build-data.md)
# and lives on the volume mounted at /photon/photon_data.
FROM eclipse-temurin:21-jre
ARG PHOTON_VERSION=0.6.2
WORKDIR /photon
ADD https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar photon.jar
VOLUME /photon/photon_data
EXPOSE 2322
CMD ["java", "-Xmx1500m", "-jar", "photon.jar", "-listen-ip", "0.0.0.0", "-listen-port", "2322", "-languages", "en"]
