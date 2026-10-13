# Pinned JDK 17 base image (Ubuntu Jammy based)
FROM eclipse-temurin:17.0.10_7-jdk-jammy

# Remove unnecessary network and build utilities if present
RUN apt-get update && \
    apt-get purge -y --auto-remove curl wget git build-essential gcc || true && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Create fixed non-root user (uid 10001, gid 10001)
RUN groupadd -g 10001 sandboxgroup && \
    useradd -u 10001 -g 10001 -d /tmp -s /bin/bash sandboxuser && \
    mkdir -p /workspace && \
    chown -R 10001:10001 /workspace /tmp

# Configure JVM home and tmpdir to point to writable tmpfs
ENV HOME=/tmp
ENV JAVA_TOOL_OPTIONS="-Duser.home=/tmp -Djava.io.tmpdir=/tmp"

# Switch to non-root user
USER 10001:10001
WORKDIR /workspace

CMD ["/bin/bash"]
