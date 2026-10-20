FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY . /usr/share/nginx/html
# 호스트 파일 권한(예: 600)과 무관하게 nginx 가 정적 파일을 읽을 수 있도록 정규화
RUN chmod +x /docker-entrypoint.sh \
    && chmod -R a+rX /usr/share/nginx/html \
    && rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/docker-entrypoint.sh \
       /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/.dockerignore

ENTRYPOINT ["/docker-entrypoint.sh"]
