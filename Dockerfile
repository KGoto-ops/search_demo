FROM ruby:3.3.6-slim

WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 --retry 3

COPY . .

EXPOSE 3000
CMD ["sh", "-c", "rm -f tmp/pids/server.pid && bin/rails server -b 0.0.0.0"]
