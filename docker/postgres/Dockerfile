# postgres:18-alpine plus pgBackRest: archive_command runs inside this container, and the
# pg-backup service runs the same image for the weekly full backup. pgBackRest is built in a
# separate stage and only its binary is copied, so apk does not pull Alpine's own postgresql.
FROM postgres:18-alpine3.24 AS pgbackrest

ARG ALPINE_MIRROR=mirrors.aliyun.com
RUN sed -i "s|dl-cdn.alpinelinux.org|${ALPINE_MIRROR}|g" /etc/apk/repositories \
  && apk add --no-cache pgbackrest

FROM postgres:18-alpine3.24

ARG ALPINE_MIRROR=mirrors.aliyun.com
RUN sed -i "s|dl-cdn.alpinelinux.org|${ALPINE_MIRROR}|g" /etc/apk/repositories \
  && apk add --no-cache ca-certificates jq libbz2 libssh2 lz4-libs libxml2 zstd-libs \
  && install -d -o postgres -g postgres -m 750 /var/spool/pgbackrest
COPY --from=pgbackrest /usr/bin/pgbackrest /usr/local/bin/pgbackrest
COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
COPY physical-backup.sh /usr/local/bin/physical-backup
RUN chmod 755 /usr/local/bin/physical-backup
