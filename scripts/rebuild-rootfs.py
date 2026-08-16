#!/usr/bin/env python3
"""Rewrite Alpine rootfs: drop leftover guest-agent copies, harden init, keep toolchain."""
from __future__ import annotations

import gzip
import io
import os
import stat
import sys

SRC = "/workspace/goar/assets/rootfs-slim.cpio.gz"
DST = "/workspace/goar/assets/rootfs-slim.cpio.gz"

DROP_PREFIXES = (
    "system/kernel/lib/goar.py",
    "opt/goar/history/sessions.json",
    "opt/goar/operator_core.txt",
    "opt/goar/OPERATOR_CORE.md",
    "opt/goar/README.md",
    "opt/goar/goar.py",
    "var/lib/goar/history",
)

KEEP_DROP_EXACT = {
    "opt/goar/goar.py",
    "system/kernel/lib/goar.py",
    "opt/goar/history/sessions.json",
    "opt/goar/operator_core.txt",
    "opt/goar/OPERATOR_CORE.md",
    "opt/goar/README.md",
}

INIT = r"""#!/bin/sh
# GOAR guest PID1 — shell + network only. Host agent drives this machine.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root
export TERM=xterm-256color COLORTERM=truecolor
export LANG=C.UTF-8 LC_ALL=C.UTF-8
export PYTHONHOME=/usr
export PYTHONPATH=/usr/lib/python3.11/site-packages
export PYTHONUNBUFFERED=1
export PIP_BREAK_SYSTEM_PACKAGES=1
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export GOAR_WORKDIR=/workspace
export GOAR_CONFIG_DIR=/opt/goar
export COLUMNS=100 LINES=30
export PS1='goaros:\w# '
umask 022

mount -t proc proc /proc 2>/dev/null || true
mount -t sysfs sysfs /sys 2>/dev/null || true
mount -t devtmpfs devtmpfs /dev 2>/dev/null || true
mkdir -p /dev/pts /dev/shm /tmp /run /root /home/operator /workspace \
  /var/lib/goar /var/log/goar /opt/goar /etc/ssl/certs
mount -t devpts devpts /dev/pts 2>/dev/null || true
mount -t tmpfs tmpfs /tmp 2>/dev/null || true
mount -t tmpfs tmpfs /run 2>/dev/null || true
chmod 1777 /tmp /dev/shm 2>/dev/null || true
chmod 700 /root 2>/dev/null || true

[ -c /dev/ttyS0 ] || mknod -m 666 /dev/ttyS0 c 4 64 2>/dev/null || true
[ -e /dev/console ] || ln -sf ttyS0 /dev/console 2>/dev/null || true
[ -e /dev/tty ] || ln -sf ttyS0 /dev/tty 2>/dev/null || true
[ -e /dev/null ] || mknod -m 666 /dev/null c 1 3 2>/dev/null || true
[ -e /dev/zero ] || mknod -m 666 /dev/zero c 1 5 2>/dev/null || true
[ -e /dev/ptmx ] || mknod -m 666 /dev/ptmx c 5 2 2>/dev/null || true

stty -F /dev/ttyS0 sane icrnl icanon echo opost onlcr cols 100 rows 30 2>/dev/null || true

if [ -d /lib/modules ]; then
  KVER=$(ls /lib/modules 2>/dev/null | head -1)
  [ -n "$KVER" ] && depmod "$KVER" 2>/dev/null || depmod 2>/dev/null || true
fi
K=/lib/modules/6.6.110-0-lts
for f in \
  $K/kernel/net/core/failover.ko \
  $K/kernel/drivers/net/net_failover.ko \
  $K/kernel/drivers/virtio/virtio.ko \
  $K/kernel/drivers/virtio/virtio_ring.ko \
  $K/kernel/drivers/virtio/virtio_pci_legacy_dev.ko \
  $K/kernel/drivers/virtio/virtio_pci_modern_dev.ko \
  $K/kernel/drivers/virtio/virtio_pci.ko \
  $K/kernel/drivers/net/virtio_net.ko
 do
  [ -f "$f" ] && insmod "$f" 2>/dev/null || true
done
i=0
while [ $i -lt 20 ]; do
  [ -e /sys/class/net/eth0 ] && break
  i=$((i+1))
  sleep 0.1 2>/dev/null || sleep 1
done

ip link set lo up 2>/dev/null || true
NIC=""
for n in eth0 ens3 enp0s3; do [ -e "/sys/class/net/$n" ] && NIC="$n" && break; done
if [ -z "$NIC" ]; then
  for n in /sys/class/net/*; do
    b=$(basename "$n"); [ "$b" = lo ] && continue; NIC="$b"; break
  done
fi

net_up() {
  [ -z "$NIC" ] && return 1
  ip link set "$NIC" up 2>/dev/null || true
  udhcpc -i "$NIC" -q -n -t 2 -T 1 2>/dev/null || true
  if ! ip -4 addr show dev "$NIC" 2>/dev/null | grep -q 'inet '; then
    ip addr flush dev "$NIC" 2>/dev/null || true
    ip addr add 192.168.86.100/24 dev "$NIC" 2>/dev/null || true
  fi
  ip link set "$NIC" up 2>/dev/null || true
  ip route replace default via 192.168.86.1 dev "$NIC" 2>/dev/null || true
  ip neigh replace 192.168.86.1 lladdr 52:54:00:01:02:03 dev "$NIC" 2>/dev/null || true
  printf 'nameserver 192.168.86.1\n' > /etc/resolv.conf
  return 0
}
net_up

hostname goaros 2>/dev/null || true
[ -f /run/goar.env ] && set -a && . /run/goar.env && set +a
chmod 600 /run/goar.env /root/.goar.env 2>/dev/null || true

echo ""
echo "[goar-boot] GOAR OS ready"
if [ -n "$NIC" ]; then
  echo "[goar-boot] net: $NIC $(ip -4 -o addr show dev $NIC 2>/dev/null | awk '{print $4}')"
else
  echo "[goar-boot] net: NO NIC"
fi
echo "[goar-boot] python: $(python3 -V 2>&1)"
echo ""

run_on_tty() {
  if command -v setsid >/dev/null 2>&1; then
    setsid /bin/sh -c 'exec "$@" <>/dev/ttyS0 >&0 2>&1' _ "$@" && return 0
  fi
  /bin/sh -c 'exec "$@" <>/dev/ttyS0 >&0 2>&1' _ "$@" && return 0
  "$@"
}

while true; do
  net_up >/dev/null 2>&1 || true
  [ -f /run/goar.env ] && set -a && . /run/goar.env && set +a
  run_on_tty /bin/sh -l || run_on_tty /bin/sh || /bin/sh
  echo "[goar-boot] restarting…"
  sleep 1
done
"""

GOAR_SH = r"""#!/bin/sh
# Guest helper — status / fetch / python. Host agent owns reasoning.
set -eu
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export SSL_CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}"
export CURL_CA_BUNDLE="${CURL_CA_BUNDLE:-$SSL_CERT_FILE}"
cmd=${1:-status}
shift || true
case "$cmd" in
  status|-v|--version)
    echo "goar-guest 3.0"
    uname -a 2>/dev/null || true
    python3 -V 2>/dev/null || true
    ip -4 -o addr show 2>/dev/null | head -5 || true
    ;;
  fetch|get)
    url=${1:-}
    [ -n "$url" ] || { echo "usage: goar fetch URL" >&2; exit 2; }
    curl -fsSL --max-time 30 "$url"
    ;;
  py|python)
    exec python3 -u "$@"
    ;;
  sh)
    exec /bin/sh -c "$*"
    ;;
  *)
    echo "usage: goar status|fetch URL|py|sh" >&2
    exit 2
    ;;
esac
"""

PROFILE = """export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export PYTHONUNBUFFERED=1
export PIP_BREAK_SYSTEM_PACKAGES=1
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
[ -f /run/goar.env ] && set -a && . /run/goar.env && set +a
alias ll='ls -la'
alias g='goar'
export PS1='goaros:\\w# '
"""

CONFIG = """# Guest prefs only. Secrets live in /run/goar.env (0600) from the host.
workdir = "/workspace"
auto_approve = true
use_proxy = false
"""

RELEASE = """GOAR_OS_VERSION=3.0.0
MODE=guest-shell
NET=wisp-manus
"""

SITECUSTOM = """import os
os.environ.setdefault("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt")
os.environ.setdefault("REQUESTS_CA_BUNDLE", "/etc/ssl/certs/ca-certificates.crt")
"""


def parse_cpio(blob: bytes):
    off = 0
    files = {}
    while off + 110 < len(blob):
        if blob[off : off + 6] != b"070701":
            nxt = blob.find(b"070701", off + 1)
            if nxt < 0:
                break
            off = nxt
            continue
        hdr = blob[off : off + 110]
        ino = int(hdr[6:14], 16)
        mode = int(hdr[14:22], 16)
        uid = int(hdr[22:30], 16)
        gid = int(hdr[30:38], 16)
        nlink = int(hdr[38:46], 16)
        mtime = int(hdr[46:54], 16)
        filesize = int(hdr[54:62], 16)
        namesize = int(hdr[94:102], 16)
        name = blob[off + 110 : off + 110 + namesize - 1].decode("utf-8", "replace")
        if name == "TRAILER!!!":
            break
        data_off = (off + 110 + namesize + 3) // 4 * 4
        body = blob[data_off : data_off + filesize]
        files[name] = {
            "ino": ino,
            "mode": mode,
            "uid": uid,
            "gid": gid,
            "nlink": nlink,
            "mtime": mtime,
            "data": body,
        }
        off = (data_off + filesize + 3) // 4 * 4
    return files


def put(files, name, data, mode=0o100644):
    files[name] = {
        "ino": 1,
        "mode": mode,
        "uid": 0,
        "gid": 0,
        "nlink": 1,
        "mtime": 1700000000,
        "data": data if isinstance(data, bytes) else data.encode(),
    }


def write_cpio(files) -> bytes:
    out = io.BytesIO()
    ino = 1

    def pad(n):
        if n % 4:
            out.write(b"\0" * (4 - n % 4))

    names = sorted(files.keys(), key=lambda n: (n != ".", n))
    for name in names:
        e = files[name]
        data = e["data"]
        mode = e["mode"]
        namesize = len(name.encode()) + 1
        hdr = (
            b"070701"
            + f"{ino:08x}".encode()
            + f"{mode:08x}".encode()
            + f"{e.get('uid',0):08x}".encode()
            + f"{e.get('gid',0):08x}".encode()
            + f"{1:08x}".encode()
            + f"{e.get('mtime',1700000000):08x}".encode()
            + f"{len(data):08x}".encode()
            + f"{0:08x}".encode()
            + f"{0:08x}".encode()
            + f"{0:08x}".encode()
            + f"{0:08x}".encode()
            + f"{namesize:08x}".encode()
            + f"{0:08x}".encode()
        )
        out.write(hdr)
        out.write(name.encode() + b"\0")
        pad(110 + namesize)
        out.write(data)
        pad(len(data))
        ino += 1
    trailer = "TRAILER!!!"
    namesize = len(trailer) + 1
    hdr = (
        b"070701"
        + f"{0:08x}".encode() * 6
        + f"{0:08x}".encode()
        + f"{0:08x}".encode() * 4
        + f"{namesize:08x}".encode()
        + f"{0:08x}".encode()
    )
    out.write(hdr)
    out.write(trailer.encode() + b"\0")
    pad(110 + namesize)
    return out.getvalue()


def main():
    raw = gzip.open(SRC, "rb").read()
    files = parse_cpio(raw)
    before = len(files)
    dropped = []
    for n in list(files):
        if n in KEEP_DROP_EXACT or n.startswith("opt/goar/history/"):
            dropped.append(n)
            del files[n]

    put(files, "init", INIT, 0o100755)
    put(files, "usr/bin/goar-boot", INIT, 0o100755)
    put(files, "usr/bin/goar", GOAR_SH, 0o100755)
    put(files, "bin/goar", GOAR_SH, 0o100755)
    put(files, "system/kernel/bin/goar", GOAR_SH, 0o100755)
    put(files, "etc/profile.d/goar.sh", PROFILE, 0o100644)
    put(files, "opt/goar/config.toml", CONFIG, 0o100644)
    put(files, "etc/goaros/release", RELEASE, 0o100644)
    put(files, "usr/lib/python3.11/sitecustomize.py", SITECUSTOM, 0o100644)
    put(files, "opt/goar/bin/goar", GOAR_SH, 0o100755)
    if "opt/goar/bin" not in files:
        put(files, "opt/goar/bin", b"", 0o40755)
    if "opt/goar/history" in files:
        del files["opt/goar/history"]

    blob = write_cpio(files)
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with gzip.open(DST, "wb", compresslevel=9) as f:
        f.write(blob)
    print(
        f"rootfs {before} → {len(files)} files, dropped {len(dropped)}, "
        f"out {os.path.getsize(DST)} bytes"
    )
    for n in dropped:
        print("  drop", n)


if __name__ == "__main__":
    sys.exit(main() or 0)
