require_relative "boot"

require "action_controller/railtie"
require "action_view/railtie"
require "sprockets/railtie" if defined?(Sprockets)

Bundler.require(*Rails.groups)

module Workspace
  class Application < Rails::Application
    config.load_defaults 8.1
  end
end
