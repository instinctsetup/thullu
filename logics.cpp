#include <bits/stdc++.h>
using namespace std;
static mt19937 rng(chrono::steady_clock::now().time_since_epoch().count());
// Helper functions
vector<int> random4()
{

    vector<int> order = {0, 1, 2, 3};

    shuffle(order.begin(), order.end(), rng);

    return order;
}

// Object definitions

//  club =0,1,2,3
// values 2-9 10-->queen
class Card
{
private:
    int value;
    string name;
    string suit;

public:
    Card(int v, string c, string n)
    {
        value = v;
        suit = c;
        name = n;
    }
    void print()
    {
        cout << "Value->" << value << " name->" << name << " club->" << suit << endl;
    }
    int getValue()
    {
        return value;
    }
    string getSuit()
    {
        return suit;
    }
};

// colour has been considering in future to distinguish betwn players easily
// hand refers to card with the player now
class Player
{
private:
    string name;
    int colour;

public:
    vector<Card> hand;
    bool isHuman;
    Player(string n, int c)
    {
        name = n;
        colour = c;
        isHuman = true;
    }
    void showCards()
    {
        for (size_t i = 0; i < hand.size(); i++)
        {
            cout << "[" << i << "] " << hand[i].getSuit()
                 << " (Value: " << hand[i].getValue() << ")" << endl;
        }
    }
    int getColour()
    {
        return colour;
    }
    string getName()
    {
        return name;
    }
};

class linked_list
{
public:
    Player *p;
    linked_list *next;

    linked_list(Player *p1) : p(p1), next(nullptr) {}
};

// Initialize
vector<Card> initialize_card()
{

    // jack==11 queen == 12 king == 13 ace ==14
    vector<Card> deck;
    vector<string> names = {"Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"};
    string s = "Spades";
    int idx = 0;
    for (int i = 2; i <= 14; i++)
    {
        deck.push_back(Card(i, s, names[i - 2]));
    }
    s = "Hearts";
    for (int i = 2; i <= 14; i++)
    {
        deck.push_back(Card(i, s, names[i - 2]));
    }
    s = "Diamonds";
    for (int i = 2; i <= 14; i++)
    {
        deck.push_back(Card(i, s, names[i - 2]));
    }
    s = "Clubs";
    for (int i = 2; i <= 14; i++)
    {
        deck.push_back(Card(i, s, names[i - 2]));
    }
    return deck;
}

vector<Player> initialize_player(vector<string> &playerName)
{
    int idx = 0;
    vector<Player> players;
    vector<int> col = random4();

    players.push_back(Player(playerName[idx], col[idx]));
    idx++;
    players.push_back(Player(playerName[idx], col[idx]));
    idx++;
    players.push_back(Player(playerName[idx], col[idx]));
    idx++;
    players.push_back(Player(playerName[idx], col[idx]));
    return players;
}

void distributeCards(vector<Player> &players, vector<Card> &deck)
{
    vector<int> permut;

    for (int i = 0; i < 13; i++)
    {
        permut.push_back(0);
        permut.push_back(1);
        permut.push_back(2);
        permut.push_back(3);
    }

    shuffle(permut.begin(), permut.end(), rng);
    shuffle(permut.begin(), permut.end(), rng);

    for (int i = 0; i < 52; i++)
    {
        players[permut[i]].hand.push_back(deck[i]);
    }
}

void printCurrDeck(vector<Player> &players)
{
    for (int i = 0; i <= 3; i++)
    {
        cout << "------Player " << players[i].getName() << "------" << endl;
        players[i].showCards();
    }
}

bool AceOfSpades(Player &p)
{
    for (Card c : p.hand)
    {
        if (c.getValue() == 14 && c.getSuit() == "Spades")
            return true;
    }
    return false;
}

linked_list *OrderOfPlaying(vector<Player> &players)
{

    for (int i = 0; i <= 3; i++)
    {
        if (AceOfSpades(players[i]))
        {
            swap(players[0], players[i]);
            break;
        }
    }

    shuffle(players.begin() + 1, players.end(), rng);
    shuffle(players.begin() + 1, players.end(), rng);
    shuffle(players.begin() + 1, players.end(), rng);

    linked_list *head = new linked_list(&players[0]);
    linked_list *temp = head;

    for (int i = 1; i <= 3; i++)
    {
        linked_list *temp1 = new linked_list(&players[i]);
        temp->next = temp1;
        temp = temp->next;
    }
    temp->next = head;

    return head;
}

// Test functions

// checks working of ace of spades func
void test_aop(vector<Player> &players)
{

    for (int i = 0; i <= 3; i++)
    {
        cout << "Player with colour" << players[i].getColour() << "->";
        cout << AceOfSpades(players[i]) << endl;
    }
}

// checks working of order of playing
void test_oop(vector<Player> &players, linked_list *head)
{

    cout << "Printing order" << endl;
    for (int i = 0; i < 4; i++)
    {
        if (players[i].getColour() == ((head->p)->getColour()))
        {
            cout << players[i].getName() << endl;
            head = head->next;
        }
        else
        {
            cout << "Error detected" << endl;
        }
    }

    cout << head->p->getName() << endl;
}

class CurrTable
{
public:
    bool firstRound;
    string currSuit;
    vector<Card> table;
    linked_list *head;
    vector<Player *> contd;
    vector<Player *> result;
};

bool checkValid(int &idx, Player *p, CurrTable &t)
{
    if (idx < 0 || idx >= (p->hand).size())
    {
        return false;
    }
    if ((p->hand)[idx].getSuit() == t.currSuit || t.currSuit == "ANY")
    {

        return true;
    }
    return false;
}

bool thul(string &suit, Player *p)
{
    vector<Card> d = p->hand;
    for (int i = 0; i < d.size(); i++)
    {
        if (d[i].getSuit() == suit)
        {
            return false;
        }
    }
    return true;
}

bool cardCmp(Card &a, Card &b)
{
    auto suitRank = [](string s)
    {
        if (s == "Clubs")
            return 3;
        if (s == "Diamonds")
            return 2;
        if (s == "Hearts")
            return 1;
        return 0; // Spades
    };

    if (suitRank(a.getSuit()) != suitRank(b.getSuit()))
        return suitRank(a.getSuit()) < suitRank(b.getSuit());

    return a.getValue() < b.getValue();
}

void sortHand(vector<Card> &hand)
{
    sort(hand.begin(), hand.end(), cardCmp);
}

void thulAdd(Player *p, vector<Card>&v)
{
    while (v.size())
    {
        (p->hand).push_back(v.back());
        v.pop_back();
    }
    sortHand(p->hand);
}

void checkWinner(CurrTable &t)
{
    for (Player* winner : t.contd)
    {
        if (winner->hand.size() != 0)
            continue;

        // Skip if already declared winner
        if (find(t.result.begin(), t.result.end(), winner) != t.result.end())
            continue;

        if (t.result.size() < 2)
            t.result.push_back(winner);

        cout << "////////////// Player "
             << winner->getName()
             << " has scored rank "
             << t.result.size()
             << "\\\\\\\\\\\\\\\\\\\\\\\\" << endl;

        // Remove corresponding node from circular list
        if (t.head != nullptr)
        {
            linked_list* curr = t.head;
            linked_list* prev = nullptr;

            while (true)
            {
                if (curr->p == winner)
                {
                    // Single node case
                    if (curr->next == curr)
                    {
                        delete curr;
                        t.head = nullptr;
                    }
                    else
                    {
                        if (prev == nullptr)
                        {
                            prev = t.head;
                            while (prev->next != t.head)
                                prev = prev->next;
                        }

                        prev->next = curr->next;

                        if (curr == t.head)
                            t.head = curr->next;

                        delete curr;
                    }
                    break;
                }

                prev = curr;
                curr = curr->next;

                if (curr == t.head)
                    break;
            }
        }

        if (t.result.size() >= 2)
        {
            t.contd.clear();
            return;
        }
    }

    t.contd.clear();
}
Player *getRandom(Player *p, CurrTable &tab)
{
    linked_list *tem = tab.head;
    int curr = 0;
    Player *giver = NULL;
    for (int i = 0; i < 4; i++)
    {
        if (((tem->p)->hand).size() > curr)
        {
            curr = ((tem->p)->hand).size();
            giver = tem->p;
        }
        tem = tem->next;
    }
    if (giver)
    {
        int idx = uniform_int_distribution<int>(
            0,
            giver->hand.size() - 1)(rng);

        Card chosen = giver->hand[idx];
        giver->hand.erase(giver->hand.begin() + idx);
        (p->hand).push_back(chosen);
        sortHand(p->hand);
    }
    return giver;
}
void Round(CurrTable &t, int &rnd)
{
    if (t.firstRound == true)
    {
        linked_list *nxt;
        int curr = -1;
        Player *ftp = (t.head)->p;
        string suit = t.currSuit;
        cout << "Game begins" << endl;
        cout << "-----------Round------------- " << rnd << endl;
        cout << "Player " << ftp->getName() << " to play" << endl;
        cout << "You must play ace of spade as round 1 ( enter idx of card ) : " << endl;
        ftp->showCards();
        if (ftp->isHuman)
        {
            int idx;
            cin >> idx;
            while (!checkValid(idx, ftp, t) || (ftp->hand)[idx].getValue() != 14)
            {
                cout << "Please play a legal card" << endl;
                cin >> idx;
            }
            if ((ftp->hand[idx]).getValue() > curr)
            {
                nxt = t.head;
                curr = (ftp->hand[idx]).getValue();
            }
            (t.table).push_back(ftp->hand[idx]);
            (ftp->hand).erase((ftp->hand).begin() + idx);
            ftp->showCards();
        }
        else
        {

            // Bot implementation
        }

        for (int i = 1; i <= 3-t.result.size(); i++)
        {
            t.head = (t.head)->next;
            ftp = (t.head)->p;
            cout << "Player " << ftp->getName() << " to play" << endl;
            bool thulf = thul(suit, ftp);
            if (thulf)
            {
                cout << "***********" << " THUL " << "*************" << endl;
                cout << "Select any card (Round 1 so cards will be discarded )" << endl;
                t.currSuit = "ANY";
            }
            else
                cout << "Suit to play -> " << suit << " Current highest -> " << curr << " Please enter index" << endl;
            ftp->showCards();
            if (ftp->isHuman)
            {
                int idx;
                cin >> idx;
                while (!checkValid(idx, ftp, t))
                {
                    cout << "Please play a legal card" << endl;
                    cin >> idx;
                }
                if ((ftp->hand[idx]).getValue() > curr && !thulf)
                {
                    nxt = t.head;
                    curr = (ftp->hand[idx]).getValue();
                }
                (t.table).push_back(ftp->hand[idx]);
                (ftp->hand).erase((ftp->hand).begin() + idx);
                ftp->showCards();
            }
            else
            {

                // Bot implementation
            }
            if (thulf)
                break;
        }
        t.head = nxt;
        t.firstRound = false;
        t.table.clear();
        t.currSuit = "ANY";
        rnd++;
    }

    else
    {
        linked_list *nxt;
        int curr = -1;
        Player *ftp = (t.head)->p;
        string suit = t.currSuit;
        Player *giver=NULL;
        if ((ftp->hand).size() == 0)
        {
            giver = getRandom(ftp, t);
            if(giver!=NULL && giver->hand.size()==0){
                t.contd.push_back(giver);
            }
        }
        checkWinner(t);
        if(t.result.size()==2){
                return;
        }
        



        cout << "-----------Round------------- " << rnd << endl;
        cout << "Player " << ftp->getName() << " to play" << endl;
        if(giver!=NULL){
                cout<<"Player "<<ftp->getName()<<" has recieved a card from "<< giver->getName() << " to finish his turn (rule 10) "<<endl;
        }
        cout << "Please enter index of any card of any suit " << endl;
        ftp->showCards();
        if (ftp->isHuman)
        {
            int idx;
            cin >> idx;
            while (!checkValid(idx, ftp, t))
            {
                cout << "Please play a legal card" << endl;
                cin >> idx;
            }
            if ((ftp->hand[idx]).getValue() > curr)
            {
                nxt = t.head;
                curr = (ftp->hand[idx]).getValue();
            }
            suit = (ftp->hand[idx]).getSuit();
            t.currSuit = suit;
            (t.table).push_back(ftp->hand[idx]);
            (ftp->hand).erase((ftp->hand).begin() + idx);
            if ((ftp->hand).size() == 0)
            {
                t.contd.push_back(ftp);
            }
            ftp->showCards();
        }
        else
        {

            // Bot implementation
        }

        for (int i = 1; i <= 3-t.result.size(); i++)
        {
            t.head = (t.head)->next;
            ftp = (t.head)->p;
            cout << "Player " << ftp->getName() << " to play" << endl;
            bool thulf = thul(suit, ftp);
            if (thulf)
            {
                cout << "***********" << " THUL " << "*************" << endl;
                cout << "Select any card " << endl;
                cout << "All cards will go to " << (nxt->p)->getName() << endl;
                t.currSuit = "ANY";
            }
            else
                cout << "Suit to play -> " << suit << " Current highest -> " << curr << " Please enter index" << endl;
            ftp->showCards();

            if (ftp->isHuman)
            {
                int idx;
                cin >> idx;
                while (!checkValid(idx, ftp, t))
                {
                    cout << "Please play a legal card" << endl;
                    cin >> idx;
                }
                if ((ftp->hand[idx]).getValue() > curr && !thulf)
                {
                    nxt = t.head;
                    curr = (ftp->hand[idx]).getValue();
                }
                (t.table).push_back(ftp->hand[idx]);
                (ftp->hand).erase((ftp->hand).begin() + idx);
                if ((ftp->hand).size() == 0)
                {
                    t.contd.push_back(ftp);
                }
                ftp->showCards();
            }
            else
            {
                // Bot implementation
            }

            if (thulf)
            {
                thulAdd(nxt->p, t.table);
                break;
            }
        }

        t.head = nxt;
        t.firstRound = false;
        t.table.clear();
        t.currSuit = "ANY";
        rnd++;
    }
}

int main()
{
    cout << "Started\n";

    vector<Card> deck = initialize_card();

    cout << "Deck created\n";

    vector<string> name = {"a", "b", "c", "d"};

    vector<Player> players = initialize_player(name);

    cout << "Players created\n";

    distributeCards(players, deck);

    cout << "Cards distributed\n";

    printCurrDeck(players);

    cout << "Finished\n";

    test_aop(players);

    linked_list *head = OrderOfPlaying(players);
    linked_list *temp = head;

    test_aop(players);
    test_oop(players, head);

    CurrTable t;
    t.firstRound = true;
    t.currSuit = "Spades";
    t.head = temp;

    int rnd = 1;
    while (t.result.size()!=2)
    {

        Round(t, rnd);
        if(t.result.size()==2){
            cout<<"____________Game Over________________"<<endl;
            cout << "RANK 1 -> " << t.result[0]->getName() << endl;
            cout << "RANK 2 -> " << t.result[1]->getName() << endl;





        }
    }
}