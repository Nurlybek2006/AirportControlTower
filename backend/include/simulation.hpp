#pragma once
#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <mutex>
#include <queue>
#include <stdexcept>
#include <random>
#include <string>
#include <tuple>
#include <thread>
#include <vector>

namespace act {
enum class Operation { Arrival, Departure };
enum class Status { Scheduled, Queued, Approaching, Ready, Landing, TakingOff, Clearing, Completed, Diverted, Cancelled };
struct Flight {
  std::string id, number, airline, aircraft;
  Operation operation{Operation::Arrival}; Status status{Status::Scheduled};
  int scheduled{0}, entered{-1}, serviceStart{-1}, completion{-1}, duration{3}, severity{0};
  double fuel{100}, burn{0.65}; bool emergency{false}; std::uint64_t tie{0};
};
struct Event { int time; std::string type, flightId, description, severity; };
class Simulation {
 public:
  explicit Simulation(bool loadDefaults=true) { if(loadDefaults)loadScenario("normal"); worker_ = std::thread([this]{ loop(); }); }
  ~Simulation() { { std::lock_guard l(m_); stopping_=true; running_=false; } cv_.notify_all(); if(worker_.joinable()) worker_.join(); }
  void start(){std::lock_guard l(m_);running_=true;cv_.notify_all();}
  void pause(){{std::lock_guard l(m_);running_=false;}cv_.notify_all();}
  void resume(){start();}
  void reset(){{std::lock_guard l(m_);running_=false;speed_=1;auto s=scenario_;seed_=seedSaved_;generatorRng_.seed(generatorSeed_);init(s);}cv_.notify_all();}
  void speed(int n){{std::lock_guard l(m_);if(n==1||n==2||n==5||n==10)speed_=n;}cv_.notify_all();}
  void step(){std::lock_guard l(m_);tick();}
  Flight submitFlight(Flight f){std::lock_guard l(m_);return enqueueLocked(std::move(f));}
  std::vector<Flight> flightsSnapshot() const {std::lock_guard l(m_);return flights_;}
  std::vector<Event> eventsSnapshot() const {std::lock_guard l(m_);return events_;}
  std::string runwaySnapshot() const {std::lock_guard l(m_);return runway_;}
  int currentTime() const {std::lock_guard l(m_);return time_;}
  bool isRunning() const {std::lock_guard l(m_);return running_;}
  int currentSpeed() const {std::lock_guard l(m_);return speed_;}
  void manual(std::string op, std::string number, std::string aircraft, double fuel, bool emergency, int severity){
    std::lock_guard l(m_); if((op!="arrival"&&op!="departure")||fuel<=0||fuel>100||number.empty()) throw std::invalid_argument("operation must be arrival or departure, flight number is required, and fuel must be between 1 and 100.");
    Flight f;f.number=number;f.airline="Manual flight";f.aircraft=aircraft.empty()?"A320":aircraft;f.operation=op=="departure"?Operation::Departure:Operation::Arrival;f.fuel=fuel;f.emergency=emergency;f.severity=emergency?std::clamp(severity,1,3):0;f.duration=f.operation==Operation::Arrival?3:2;enqueueLocked(std::move(f),"Manual flight entered the priority queue");
  }
  void randomFlight(){std::lock_guard l(m_);addRandomFlight();}
  void configureGenerator(bool enabled,int arrivalPercent,double fuelMin,double fuelMax,int emergencyPercent,int interval,std::uint32_t seed){
    if(arrivalPercent<0||arrivalPercent>100||fuelMin<1||fuelMax>100||fuelMin>fuelMax||emergencyPercent<0||emergencyPercent>100||interval<1||interval>60)throw std::invalid_argument("generator settings are out of range");
    std::lock_guard l(m_);autoGeneration_=enabled;arrivalPercent_=arrivalPercent;fuelMin_=fuelMin;fuelMax_=fuelMax;emergencyPercent_=emergencyPercent;trafficInterval_=interval;generatorSeed_=seed;generatorRng_.seed(seed);event("generator_configured","",enabled?"Automatic flight generation enabled":"Automatic flight generation configured");
  }
  std::string generatorJson(){std::lock_guard l(m_);return "{\"enabled\":"+(autoGeneration_?std::string("true"):std::string("false"))+",\"arrivalPercent\":"+std::to_string(arrivalPercent_)+",\"fuelMin\":"+std::to_string(fuelMin_)+",\"fuelMax\":"+std::to_string(fuelMax_)+",\"emergencyPercent\":"+std::to_string(emergencyPercent_)+",\"trafficInterval\":"+std::to_string(trafficInterval_)+",\"seed\":"+std::to_string(generatorSeed_)+"}";}
  void loadScenario(const std::string& s){std::lock_guard l(m_);scenario_=(s=="heavy"||s=="overload")?s:"normal";seedSaved_=scenario_=="normal"?731:scenario_=="heavy"?1942:5813;seed_=seedSaved_;generatorRng_.seed(generatorSeed_);init(scenario_);}
  std::string stateJson(){std::lock_guard l(m_);return state();}
  std::string flightsJson(){std::lock_guard l(m_);std::string o="[";bool first=true;for(const auto& f:flights_){if(f.status==Status::Completed||f.status==Status::Diverted||f.status==Status::Cancelled)continue;if(!first)o+=",";first=false;o+=flightJson(f);}return o+"]";}
  std::string eventsJson(){std::lock_guard l(m_);std::string o="[";bool first=true;for(auto it=events_.rbegin();it!=events_.rend()&&it!=events_.rbegin()+std::min<std::size_t>(events_.size(),100);++it){if(!first)o+=",";first=false;o+="{\"time\":"+std::to_string(it->time)+",\"type\":"+q(it->type)+",\"flightId\":"+q(it->flightId)+",\"description\":"+q(it->description)+",\"severity\":"+q(it->severity)+"}";}return o+"]";}
  std::string statsJson(){std::lock_guard l(m_);return stats();}
  std::string scenariosJson(){return R"([{"id":"normal","name":"Normal Operations","seed":731,"flights":14,"horizon":180,"description":"Low traffic with a small number of emergencies."},{"id":"heavy","name":"Heavy Traffic","seed":1942,"flights":30,"horizon":180,"description":"Dense arrival and departure traffic with moderate emergency risk."},{"id":"overload","name":"Emergency Overload","seed":5813,"flights":24,"horizon":180,"description":"Simultaneous urgent arrivals and low-fuel emergency aircraft."}])";}
  std::string compare(){std::lock_guard l(m_);auto backup=std::make_tuple(flights_,events_,time_,runway_,active_,scenario_,serial_,tie_,completedAt_,utilTicks_,queueMax_,seed_,seedSaved_,rng_,autoGeneration_);std::string o="[";int index=0;autoGeneration_=false;for(const std::string s:{"normal","heavy","overload"}){scenario_=s;seedSaved_=s=="normal"?731:s=="heavy"?1942:5813;seed_=seedSaved_;init(s);int horizon=180;for(int i=0;i<horizon;++i)tick();if(index++)o+=",";o+="{\"scenario\":"+q(s)+",\"statistics\":"+stats()+"}";}std::tie(flights_,events_,time_,runway_,active_,scenario_,serial_,tie_,completedAt_,utilTicks_,queueMax_,seed_,seedSaved_,rng_,autoGeneration_)=std::move(backup);return o+"]";}
 private:
  mutable std::mutex m_;std::condition_variable cv_;std::thread worker_;bool stopping_=false,running_=false,autoGeneration_=false;int speed_=1,time_=0,clearLeft_=0,arrivalPercent_=50,emergencyPercent_=5,trafficInterval_=4;double fuelMin_=40,fuelMax_=100;std::uint32_t seed_=731,seedSaved_=731,generatorSeed_=731;std::string scenario_="normal",runway_="FREE";std::mt19937 rng_{731},generatorRng_{731};std::vector<Flight> flights_;std::vector<Event> events_;int active_=-1,serial_=0,queueMax_=0,utilTicks_=0;std::uint64_t tie_=0;long long completedAt_=0;std::ofstream log_{"events.log",std::ios::app};
  static std::string q(const std::string&s){std::string o="\"";for(char c:s){if(c=='\\'||c=='\"')o+='\\';if(c=='\n')o+="\\n";else o+=c;}return o+'\"';}
  static const char* op(Operation x){return x==Operation::Arrival?"arrival":"departure";}
  static const char* status(Status x){switch(x){case Status::Scheduled:return"scheduled";case Status::Queued:return"queued";case Status::Approaching:return"approaching";case Status::Ready:return"ready";case Status::Landing:return"landing";case Status::TakingOff:return"taking_off";case Status::Clearing:return"clearing";case Status::Completed:return"completed";case Status::Diverted:return"diverted";case Status::Cancelled:return"cancelled";}return"unknown";}
  Flight enqueueLocked(Flight f,const std::string& description="Flight entered the priority queue"){
    if(f.number.empty()||!std::isfinite(f.fuel)||f.fuel<=0||f.fuel>100||!std::isfinite(f.burn)||f.burn<=0||f.duration<1)throw std::invalid_argument("invalid flight data");
    if(f.id.empty())f.id="ACT-"+std::to_string(++serial_);else if(std::any_of(flights_.begin(),flights_.end(),[&](const Flight& old){return old.id==f.id;}))throw std::invalid_argument("flight ID must be unique");
    f.scheduled=time_;f.entered=time_;f.serviceStart=-1;f.completion=-1;f.status=Status::Queued;f.tie=++tie_;if(f.emergency)f.severity=std::clamp(f.severity,1,3);else f.severity=0;
    flights_.push_back(f);event("flight_queued",f.id,description,f.emergency?"critical":"info");return f;
  }
  std::string flightJson(const Flight&f){return "{\"id\":"+q(f.id)+",\"number\":"+q(f.number)+",\"airline\":"+q(f.airline)+",\"aircraft\":"+q(f.aircraft)+",\"operation\":"+q(op(f.operation))+",\"status\":"+q(status(f.status))+",\"scheduledTime\":"+std::to_string(f.scheduled)+",\"queueEntered\":"+std::to_string(f.entered)+",\"serviceStart\":"+std::to_string(f.serviceStart)+",\"completion\":"+std::to_string(f.completion)+",\"fuel\":"+std::to_string(std::max(0.0,f.fuel))+",\"burnRate\":"+std::to_string(f.burn)+",\"emergency\":"+(f.emergency?"true":"false")+",\"severity\":"+std::to_string(f.severity)+",\"wait\":"+std::to_string(f.entered<0?0:time_-f.entered)+"}";}
  void event(std::string type,std::string id,std::string d,std::string sev="info"){events_.push_back({time_,type,id,d,sev});if(log_)log_<<"T+"<<time_<<","<<type<<","<<id<<","<<d<<"\n";}
  void addRandomFlight(){std::uniform_int_distribution<int> coin(0,99);std::uniform_real_distribution<double> fuel(fuelMin_,fuelMax_);Flight f;f.id="ACT-"+std::to_string(++serial_);f.number=(coin(generatorRng_)%2?"KC":"QZ")+std::to_string(100+coin(generatorRng_));f.airline=f.number.rfind("KC",0)==0?"Kazakh Air":"Qazaq Wings";f.aircraft=(coin(generatorRng_)%3==0?"B738":coin(generatorRng_)%2==0?"A320":"E190");f.operation=coin(generatorRng_)<arrivalPercent_?Operation::Arrival:Operation::Departure;f.duration=f.operation==Operation::Arrival?3:2;f.fuel=fuel(generatorRng_);f.burn=.8+(coin(generatorRng_)%8)/10.0;f.emergency=coin(generatorRng_)<emergencyPercent_;f.severity=f.emergency?1+coin(generatorRng_)%3:0;f.scheduled=time_+1;f.tie=++tie_;flights_.push_back(f);event("flight_generated",f.id,std::string("Automatic random ")+op(f.operation)+" generated",f.emergency?"warning":"info");}
  void init(const std::string&s){time_=0;clearLeft_=0;runway_="FREE";active_=-1;serial_=0;tie_=0;queueMax_=0;utilTicks_=0;completedAt_=0;events_.clear();flights_.clear();rng_.seed(seed_);int count=s=="normal"?14:s=="heavy"?30:24;for(int i=0;i<count;i++){Flight f;f.id="ACT-"+std::to_string(++serial_);f.number=(i%2?"KC":"QZ")+std::to_string(100+i);f.airline=i%2?"Kazakh Air":"Qazaq Wings";f.aircraft=(i%3==0?"B738":i%3==1?"A320":"E190");f.operation=(i%2?Operation::Departure:Operation::Arrival);f.scheduled=(i==0?0:(s=="normal"?i*3:i*2));f.duration=f.operation==Operation::Arrival?3:2;f.fuel=s=="overload"?35.0+(rng_()%45):70.0+(rng_()%30);f.burn=.8+(rng_()%8)/10.0;f.emergency=(s=="overload"?(i<7):(rng_()%(s=="normal"?16:8)==0));f.severity=f.emergency?(s=="overload"&&i<3?3:1+rng_()%3):0;if(s=="overload"&&i<5)f.scheduled=0;f.tie=++tie_;flights_.push_back(f);}scenario_=s;event("scenario_loaded","",s+" scenario loaded");}
  double endurance(const Flight&f)const{return f.burn>0?f.fuel/f.burn:9999;}
  int priority(const Flight&f)const{if(f.operation==Operation::Arrival&&f.emergency&&f.severity>=3)return 0;if(f.operation==Operation::Arrival&&f.emergency)return 1;if(f.operation==Operation::Departure&&f.emergency)return 2;int age=std::max(0,time_-f.entered)/12;return std::max(1,3-age);}
  bool before(const Flight&a,const Flight&b)const{int pa=priority(a),pb=priority(b);if(pa!=pb)return pa<pb;bool bothEmergencyArrivals=a.operation==Operation::Arrival&&a.emergency&&b.operation==Operation::Arrival&&b.emergency;if(pa==1&&bothEmergencyArrivals&&endurance(a)!=endurance(b))return endurance(a)<endurance(b);if(pa==2&&a.emergency&&b.emergency&&a.severity!=b.severity)return a.severity>b.severity;if(a.entered!=b.entered)return a.entered<b.entered;return a.id<b.id;}
  void tick(){++time_;for(auto&f:flights_){if(f.status==Status::Scheduled&&f.scheduled<=time_){f.status=Status::Queued;f.entered=time_;event("flight_queued",f.id,"Entered runway priority queue");}if(f.status==Status::Queued||f.status==Status::Approaching||f.status==Status::Ready){f.fuel=std::max(0.0,f.fuel-f.burn);f.status=f.operation==Operation::Arrival?Status::Approaching:Status::Ready;if(f.fuel<=15&&!f.emergency){f.emergency=true;f.severity=2;event("fuel_critical",f.id,"Fuel critical; priority escalated","warning");}if(f.fuel<=0){f.status=Status::Diverted;event("flight_diverted",f.id,"Fuel endurance exhausted before runway service","critical");}}}if(autoGeneration_&&time_%trafficInterval_==0)addRandomFlight();
    if(runway_=="CLEARING"){if(--clearLeft_<=0){runway_="FREE";active_=-1;event("runway_free","","Runway clearing complete");}}
    else if(active_>=0){auto&f=flights_[active_];f.fuel=std::max(0.0,f.fuel-f.burn);if(f.fuel<=15&&!f.emergency){f.emergency=true;f.severity=2;event("fuel_critical",f.id,"Fuel critical during runway service; emergency recorded","warning");}utilTicks_++;if(time_-f.serviceStart>=f.duration){f.status=Status::Completed;f.completion=time_;completedAt_+=time_;event("flight_completed",f.id,"Runway service completed","success");runway_="CLEARING";clearLeft_=1;}}
    if(runway_=="FREE"){auto lowerPriority=[this](int a,int b){return before(flights_[b],flights_[a]);};std::priority_queue<int,std::vector<int>,decltype(lowerPriority)> candidates(lowerPriority);for(int i=0;i<(int)flights_.size();i++)if(flights_[i].status==Status::Queued||flights_[i].status==Status::Approaching||flights_[i].status==Status::Ready)candidates.push(i);if(!candidates.empty()){active_=candidates.top();auto&f=flights_[active_];f.serviceStart=time_;f.status=f.operation==Operation::Arrival?Status::Landing:Status::TakingOff;runway_=f.operation==Operation::Arrival?"OCCUPIED_LANDING":"OCCUPIED_TAKEOFF";event("runway_occupied",f.id,std::string("Runway service started: ")+op(f.operation),f.emergency?"critical":"info");}}
    int qn=0;for(auto&f:flights_)if(f.status==Status::Queued||f.status==Status::Approaching||f.status==Status::Ready)qn++;queueMax_=std::max(queueMax_,qn);
  }
  void loop(){std::unique_lock l(m_);while(!stopping_){if(!running_){cv_.wait(l,[this]{return stopping_||running_;});continue;}const int intervalSpeed=speed_;const int ms=250/intervalSpeed;if(cv_.wait_for(l,std::chrono::milliseconds(ms),[this,intervalSpeed]{return stopping_||!running_||speed_!=intervalSpeed;}))continue;if(running_&&!stopping_&&speed_==intervalSpeed)tick();}}
  std::string stats(){int gen=(int)flights_.size(),done=0,arr=0,dep=0,em=0,div=0,pending=0,waitSum=0,depDelay=0,arrDelay=0,maxWait=0,arrN=0,depN=0;for(auto&f:flights_){int elapsedWait=f.entered<0?0:(f.serviceStart>=0?std::max(0,f.serviceStart-f.entered):std::max(0,time_-f.entered));maxWait=std::max(maxWait,elapsedWait);if(f.status==Status::Completed){done++;int wait=std::max(0,f.serviceStart-f.entered);waitSum+=wait;if(f.operation==Operation::Arrival){arr++;arrDelay+=std::max(0,f.serviceStart-f.scheduled);arrN++;}else{dep++;depDelay+=std::max(0,f.serviceStart-f.scheduled);depN++;}if(f.emergency)em++;}else if(f.status==Status::Diverted)div++;else pending++;}int qn=0;for(auto&f:flights_)if(f.status==Status::Queued||f.status==Status::Approaching||f.status==Status::Ready)qn++;double util=time_?100.0*utilTicks_/time_:0;return "{\"scenario\":"+q(scenario_)+",\"time\":"+std::to_string(time_)+",\"totalGenerated\":"+std::to_string(gen)+",\"completed\":"+std::to_string(done)+",\"completedArrivals\":"+std::to_string(arr)+",\"completedDepartures\":"+std::to_string(dep)+",\"emergencyHandled\":"+std::to_string(em)+",\"averageWait\":"+std::to_string(done?double(waitSum)/done:0)+",\"averageDepartureDelay\":"+std::to_string(depN?double(depDelay)/depN:0)+",\"averageArrivalDelay\":"+std::to_string(arrN?double(arrDelay)/arrN:0)+",\"averageServiceDelay\":"+std::to_string(done?double(waitSum)/done:0)+",\"maxWait\":"+std::to_string(maxWait)+",\"queueLength\":"+std::to_string(qn)+",\"maxQueueLength\":"+std::to_string(queueMax_)+",\"runwayUtilization\":"+std::to_string(util)+",\"diverted\":"+std::to_string(div)+",\"pending\":"+std::to_string(pending)+"}";}
  std::string state(){int active=0,queue=0,done=0,em=0;for(auto&f:flights_){if(f.status==Status::Landing||f.status==Status::TakingOff)active++;if(f.status==Status::Queued||f.status==Status::Approaching||f.status==Status::Ready)queue++;if(f.status==Status::Completed)done++;if(f.emergency&&f.status!=Status::Completed&&f.status!=Status::Diverted)em++;}return "{\"time\":"+std::to_string(time_)+",\"running\":"+(running_?"true":"false")+",\"speed\":"+std::to_string(speed_)+",\"scenario\":"+q(scenario_)+",\"runway\":"+q(runway_)+",\"activeFlights\":"+std::to_string(active)+",\"waitingFlights\":"+std::to_string(queue)+",\"completedFlights\":"+std::to_string(done)+",\"emergencyCount\":"+std::to_string(em)+",\"statistics\":"+stats()+"}";}
};
}
