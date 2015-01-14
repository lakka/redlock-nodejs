
# Vagrantfile for Gearsloth test environment
# vi: set sw=2 ts=2 sts=2 ft=ruby :

VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  ### Machine settings
  #
  config.vm.hostname = "redlock"
  config.vm.box      = "ubuntu/trusty64"
  config.vm.box_url  = "https://cloud-images.ubuntu.com/vagrant/trusty/current/trusty-server-cloudimg-amd64-vagrant-disk1.box"

  ### Provisioning
  #
  config.vm.provision :shell, path: "virt/ttyfix.sh"
  config.vm.provision :shell, path: "virt/apt.sh"
  config.vm.provision :shell, path: "virt/make.sh"
  config.vm.provision :shell, path: "virt/docker.sh"

  ### Virtalbox configuration
  #
  config.vm.provider :virtualbox do |virtualbox|
    virtualbox.name   = "redlock-node-testenv"
    virtualbox.memory = 2048
    virtualbox.cpus   = 2
  end
end
